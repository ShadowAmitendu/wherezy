"""Shared AI provider client (Google Gemini API or Local LLM / OpenAI-compatible), encryption, media validation, and JSON schema helpers."""

from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import io
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple, Type, TypeVar
from urllib.parse import urlparse

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, UploadFile, status
from google import genai
from google.genai import errors as genai_errors
import httpx
from PIL import Image
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.config import SECRET_KEY
from backend.app.models import Setting

GEMINI_MODEL = "gemini-3.8-flash"
GEMINI_SETTING_KEY = "gemini_api_key"
AI_PROVIDER_KEY = "ai_provider"
GEMINI_MODEL_KEY = "gemini_model"
LOCAL_LLM_BASE_URL_KEY = "local_llm_base_url"
LOCAL_LLM_MODEL_KEY = "local_llm_model"
LOCAL_LLM_API_KEY_SETTING = "local_llm_api_key"
LOCAL_LLM_STT_MODEL_KEY = "local_llm_stt_model"

MAX_AUDIO_BYTES = 15 * 1024 * 1024  # 15 MB (safely below Gemini 20 MB inline limit)
MAX_IMAGE_BYTES = 15 * 1024 * 1024
LOCAL_LLM_TIMEOUT_SECONDS = 120.0

TModel = TypeVar("TModel", bound=BaseModel)

AUDIO_MIME_ALIASES: Dict[str, str] = {
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/mp3": "audio/mp3",
    "audio/mpeg": "audio/mpeg",
    "audio/aiff": "audio/aiff",
    "audio/x-aiff": "audio/aiff",
    "audio/aac": "audio/aac",
    "audio/ogg": "audio/ogg",
    "application/ogg": "audio/ogg",
    "audio/flac": "audio/flac",
    "audio/x-flac": "audio/flac",
    "audio/m4a": "audio/m4a",
    "audio/x-m4a": "audio/m4a",
    "audio/mp4": "audio/m4a",
    "audio/opus": "audio/opus",
    "audio/webm": "audio/webm",
    "video/webm": "audio/webm",
}

AUDIO_EXT_TO_MIME: Dict[str, str] = {
    ".wav": "audio/wav",
    ".mp3": "audio/mp3",
    ".mpeg": "audio/mpeg",
    ".aiff": "audio/aiff",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/m4a",
    ".mp4": "audio/m4a",
    ".opus": "audio/opus",
    ".webm": "audio/webm",
}

AUDIO_MIME_TO_FORMAT: Dict[str, str] = {
    "audio/wav": "wav",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/aiff": "aiff",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    "audio/opus": "opus",
    "audio/webm": "webm",
}

IMAGE_MIME_ALIASES: Dict[str, str] = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
    "image/heic": "image/heic",
    "image/heif": "image/heif",
    "image/gif": "image/gif",
    "image/bmp": "image/bmp",
    "image/tiff": "image/tiff",
}

IMAGE_EXT_TO_MIME: Dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


@dataclass
class AiConfigState:
    provider: Literal["gemini", "local"]
    ai_configured: bool
    gemini_api_key: Optional[str]
    gemini_key_source: Literal["env", "settings", "none"]
    gemini_api_key_hint: Optional[str]
    gemini_model: str
    local_llm_base_url: Optional[str]
    local_llm_model: Optional[str]
    local_llm_api_key: Optional[str]
    local_llm_key_source: Literal["env", "settings", "none"]
    local_llm_api_key_hint: Optional[str]
    local_llm_stt_model: Optional[str]

    @property
    def status_label(self) -> str:
        if not self.ai_configured:
            return "Not Configured"
        if self.provider == "local":
            return f"Local LLM ({self.local_llm_model or 'Configured'})"
        source = "Env Key" if self.gemini_key_source == "env" else "API Key"
        return f"Gemini · {self.gemini_model} ({source})"


class _PingSchema(BaseModel):
    ok: bool = True


def _get_fernet() -> Fernet:
    digest = hashlib.sha256(SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def mask_api_key(api_key: str) -> str:
    """Return a masked display hint preserving at most the last 4 characters."""
    cleaned = api_key.strip()
    if len(cleaned) <= 4:
        return "••••"
    return f"••••{cleaned[-4:]}"


def _save_encrypted_secret(db: Session, setting_key: str, raw_secret: str) -> None:
    cleaned = raw_secret.strip()
    if not cleaned:
        _clear_secret(db, setting_key)
        return
    token = _get_fernet().encrypt(cleaned.encode("utf-8")).decode("ascii")
    payload = json.dumps({"enc": token})
    row = db.query(Setting).filter(Setting.key == setting_key).first()
    if not row:
        db.add(Setting(key=setting_key, value_json=payload))
    else:
        row.value_json = payload


def _clear_secret(db: Session, setting_key: str) -> None:
    db.query(Setting).filter(Setting.key == setting_key).delete()


def _resolve_secret(
    db: Session,
    setting_key: str,
    env_names: Tuple[str, ...],
) -> Tuple[Optional[str], Literal["env", "settings", "none"], Optional[str]]:
    for env_name in env_names:
        env_val = (os.getenv(env_name) or "").strip()
        if env_val:
            return env_val, "env", mask_api_key(env_val)

    row = db.query(Setting).filter(Setting.key == setting_key).first()
    if row and row.value_json:
        try:
            data = json.loads(row.value_json)
            token = data.get("enc") if isinstance(data, dict) else None
            if isinstance(token, str) and token:
                decrypted = _get_fernet().decrypt(token.encode("ascii")).decode("utf-8").strip()
                if decrypted:
                    return decrypted, "settings", mask_api_key(decrypted)
        except (InvalidToken, json.JSONDecodeError, UnicodeDecodeError):
            return None, "none", None

    return None, "none", None


def _get_str_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row or not row.value_json:
        return None
    try:
        val = json.loads(row.value_json)
        if isinstance(val, str):
            cleaned = val.strip()
            return cleaned or None
    except Exception:
        return None
    return None


def set_ai_str_setting(db: Session, key: str, value: Optional[str]) -> None:
    """Persist or delete an optional string AI configuration setting."""
    cleaned = (value or "").strip()
    if not cleaned:
        db.query(Setting).filter(Setting.key == key).delete()
        return
    val_json = json.dumps(cleaned)
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row:
        db.add(Setting(key=key, value_json=val_json))
    else:
        row.value_json = val_json


def normalize_local_base_url(raw_url: str) -> str:
    """Validate and normalize a local/OpenAI-compatible LLM base URL."""
    cleaned = raw_url.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_AI_URL",
                    "message": "Local LLM base URL cannot be empty.",
                }
            },
        )
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_AI_URL",
                    "message": "Local LLM base URL must start with http:// or https:// (for example http://127.0.0.1:11434/v1).",
                }
            },
        )
    return cleaned.rstrip("/")


def _endpoint_candidates(base_url: str, endpoint: str) -> List[str]:
    normalized = base_url.rstrip("/")
    parsed = urlparse(normalized)
    if not parsed.path or parsed.path == "/":
        # User pasted host:port (e.g. http://127.0.0.1:11434) without /v1
        return [f"{normalized}/v1{endpoint}", f"{normalized}{endpoint}"]
    return [f"{normalized}{endpoint}"]


def _redact_secret(message: str, *secrets: Optional[str]) -> str:
    cleaned = message
    for sec in secrets:
        if sec and len(sec) >= 4:
            cleaned = cleaned.replace(sec, "[REDACTED]")
    return cleaned


def save_gemini_api_key(db: Session, raw_key: str) -> None:
    """Encrypt and store a Gemini API key in the settings table."""
    _save_encrypted_secret(db, GEMINI_SETTING_KEY, raw_key)


def clear_gemini_api_key(db: Session) -> None:
    """Remove any stored Gemini API key from the settings table."""
    _clear_secret(db, GEMINI_SETTING_KEY)


def get_gemini_key_info(db: Session) -> Tuple[Optional[str], Literal["env", "settings", "none"], Optional[str]]:
    """Resolve the active Gemini API key without ever exposing plaintext in API responses."""
    return _resolve_secret(db, GEMINI_SETTING_KEY, ("GEMINI_API_KEY", "GOOGLE_API_KEY"))


def save_local_llm_api_key(db: Session, raw_key: str) -> None:
    """Encrypt and store an optional Local / OpenAI-compatible API key in settings."""
    _save_encrypted_secret(db, LOCAL_LLM_API_KEY_SETTING, raw_key)


def clear_local_llm_api_key(db: Session) -> None:
    """Remove any stored Local / OpenAI-compatible API key from settings."""
    _clear_secret(db, LOCAL_LLM_API_KEY_SETTING)


def get_local_llm_key_info(db: Session) -> Tuple[Optional[str], Literal["env", "settings", "none"], Optional[str]]:
    """Resolve optional API key / bearer token for local or OpenAI-compatible endpoints."""
    return _resolve_secret(
        db,
        LOCAL_LLM_API_KEY_SETTING,
        ("WHEREZY_LOCAL_LLM_API_KEY", "LOCAL_LLM_API_KEY"),
    )


def get_ai_config_status(db: Session) -> AiConfigState:
    """Resolve active AI provider ('gemini' or 'local') and provider credentials cleanly."""
    gemini_key, gemini_src, gemini_hint = get_gemini_key_info(db)
    gemini_model = (
        os.getenv("WHEREZY_GEMINI_MODEL")
        or _get_str_setting(db, GEMINI_MODEL_KEY)
        or GEMINI_MODEL
    ).strip()

    local_url_raw = (
        os.getenv("WHEREZY_LOCAL_LLM_URL")
        or os.getenv("LOCAL_LLM_BASE_URL")
        or _get_str_setting(db, LOCAL_LLM_BASE_URL_KEY)
        or ""
    ).strip()
    local_url = local_url_raw.rstrip("/") or None
    local_model = (
        os.getenv("WHEREZY_LOCAL_LLM_MODEL")
        or os.getenv("LOCAL_LLM_MODEL")
        or _get_str_setting(db, LOCAL_LLM_MODEL_KEY)
        or ""
    ).strip() or None
    local_key, local_src, local_hint = get_local_llm_key_info(db)
    local_stt = (
        os.getenv("WHEREZY_LOCAL_LLM_STT_MODEL")
        or os.getenv("LOCAL_LLM_STT_MODEL")
        or _get_str_setting(db, LOCAL_LLM_STT_MODEL_KEY)
        or ""
    ).strip() or None

    env_provider = (os.getenv("WHEREZY_AI_PROVIDER") or "").strip().lower()
    db_provider = (_get_str_setting(db, AI_PROVIDER_KEY) or "").lower()

    provider: Literal["gemini", "local"] = "gemini"
    if env_provider in ("gemini", "local"):
        provider = env_provider  # type: ignore[assignment]
    elif db_provider in ("gemini", "local"):
        provider = db_provider  # type: ignore[assignment]
    elif local_url and local_model and not gemini_key:
        provider = "local"

    ai_configured = (
        bool(local_url and local_model) if provider == "local" else bool(gemini_key)
    )

    return AiConfigState(
        provider=provider,
        ai_configured=ai_configured,
        gemini_api_key=gemini_key,
        gemini_key_source=gemini_src,
        gemini_api_key_hint=gemini_hint,
        gemini_model=gemini_model,
        local_llm_base_url=local_url,
        local_llm_model=local_model,
        local_llm_api_key=local_key,
        local_llm_key_source=local_src,
        local_llm_api_key_hint=local_hint,
        local_llm_stt_model=local_stt,
    )


def normalize_audio_mime_type(content_type: Optional[str], filename: Optional[str] = None) -> str:
    """Normalize browser/uploaded audio MIME types to AudioContent literals."""
    base = (content_type or "").split(";")[0].strip().lower()
    if base in AUDIO_MIME_ALIASES:
        return AUDIO_MIME_ALIASES[base]

    if filename:
        ext = Path(filename).suffix.lower()
        if ext in AUDIO_EXT_TO_MIME:
            return AUDIO_EXT_TO_MIME[ext]

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "error": {
                "code": "UNSUPPORTED_AUDIO_FORMAT",
                "message": "Unsupported audio format. Please record with your microphone or upload a WAV, MP3, M4A, OGG, FLAC, AAC, or WebM audio clip.",
            }
        },
    )


def normalize_image_mime_type(content_type: Optional[str], filename: Optional[str] = None) -> str:
    """Normalize uploaded/stored image MIME types to ImageContent literals."""
    base = (content_type or "").split(";")[0].strip().lower()
    if base in IMAGE_MIME_ALIASES:
        return IMAGE_MIME_ALIASES[base]

    if filename:
        ext = Path(filename).suffix.lower()
        if ext in IMAGE_EXT_TO_MIME:
            return IMAGE_EXT_TO_MIME[ext]

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "error": {
                "code": "UNSUPPORTED_IMAGE_FORMAT",
                "message": "Unsupported image format. Upload a JPG, PNG, WebP, HEIC, or GIF image.",
            }
        },
    )


def read_uploaded_audio(audio: Optional[UploadFile]) -> Tuple[Optional[bytes], Optional[str]]:
    """Read and validate optional uploaded audio clip against MAX_AUDIO_BYTES."""
    if audio is None:
        return None, None
    raw_bytes = audio.file.read(MAX_AUDIO_BYTES + 1)
    if len(raw_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "AUDIO_TOO_LARGE",
                    "message": "Voice message is too large (maximum 15 MB). Please keep recordings brief.",
                }
            },
        )
    if not raw_bytes:
        return None, None
    return raw_bytes, normalize_audio_mime_type(audio.content_type, audio.filename)


def read_uploaded_image(image: Optional[UploadFile]) -> Tuple[Optional[bytes], Optional[str]]:
    """Read and validate optional uploaded photo/image against MAX_IMAGE_BYTES."""
    if image is None:
        return None, None
    raw_bytes = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(raw_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "IMAGE_TOO_LARGE",
                    "message": "Image is too large (maximum 15 MB). Please choose a smaller photo.",
                }
            },
        )
    if not raw_bytes:
        return None, None
    return raw_bytes, normalize_image_mime_type(image.content_type, image.filename)


def inline_json_schema(model_cls: Type[BaseModel]) -> Dict[str, Any]:
    """Generate a self-contained JSON Schema with $defs/$ref resolved cleanly."""
    raw = model_cls.model_json_schema()
    defs = raw.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, list):
            return [resolve(item) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            ref_name = str(node["$ref"]).split("/")[-1]
            if ref_name in defs:
                merged = {k: v for k, v in defs[ref_name].items() if k != "title"}
                return resolve(merged)
        return {k: resolve(v) for k, v in node.items() if k != "default"}

    return resolve(raw)


def strip_json_fences(text: str) -> str:
    """Clean thinking tags, markdown fences, and pre/post-amble around JSON payloads."""
    trimmed = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()
    if trimmed.startswith("```"):
        trimmed = re.sub(r"^```(?:json)?\s*", "", trimmed, flags=re.IGNORECASE)
        trimmed = re.sub(r"\s*```$", "", trimmed)
        trimmed = trimmed.strip()
    # If the model wrapped JSON with short commentary, extract outermost object
    if trimmed and not trimmed.startswith("{"):
        first = trimmed.find("{")
        last = trimmed.rfind("}")
        if first != -1 and last > first:
            return trimmed[first : last + 1]
    return trimmed


def _create_genai_client(api_key: str) -> genai.Client:
    """Default factory seam for instantiating the Google GenAI client."""
    return genai.Client(api_key=api_key)


def _create_httpx_client(timeout: float = LOCAL_LLM_TIMEOUT_SECONDS) -> httpx.Client:
    """Default factory seam for instantiating the HTTP client for Local LLMs."""
    return httpx.Client(timeout=timeout)


def require_configured_api_key(db: Session) -> str:
    """Resolve active Gemini API key or raise 503 AI_NOT_CONFIGURED."""
    api_key, _, _ = get_gemini_key_info(db)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "AI_NOT_CONFIGURED",
                    "message": "AI is not configured yet. Ask an admin to configure a Gemini API key or Local LLM in Settings.",
                }
            },
        )
    return api_key


def _prepare_image_data_url(image_bytes: bytes, image_mime_type: str) -> str:
    """Encode image bytes as a data URL, transcoding less-common formats to JPEG for vision compatibility."""
    if image_mime_type in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        b64 = base64.b64encode(image_bytes).decode("ascii")
        return f"data:{image_mime_type};base64,{b64}"
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            rgb = img.convert("RGB")
            out = io.BytesIO()
            rgb.save(out, format="JPEG", quality=90)
            b64 = base64.b64encode(out.getvalue()).decode("ascii")
            return f"data:image/jpeg;base64,{b64}"
    except Exception:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        return f"data:{image_mime_type};base64,{b64}"


def _extract_openai_message_text(data: Dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    msg = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(msg, dict):
        return ""
    content = msg.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(parts)
    return ""


def _local_headers(api_key: Optional[str]) -> Dict[str, str]:
    headers = {"Accept": "application/json"}
    if api_key and api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"
    return headers


def _transcribe_audio_with_local_stt(
    client: httpx.Client,
    *,
    base_url: str,
    api_key: Optional[str],
    stt_model: str,
    audio_bytes: bytes,
    audio_mime_type: str,
) -> str:
    fmt = AUDIO_MIME_TO_FORMAT.get(audio_mime_type, "webm")
    headers = _local_headers(api_key)
    last_err: Optional[str] = None
    for url in _endpoint_candidates(base_url, "/audio/transcriptions"):
        try:
            resp = client.post(
                url,
                headers=headers,
                data={"model": stt_model},
                files={"file": (f"voice.{fmt}", audio_bytes, audio_mime_type)},
            )
        except Exception as exc:
            last_err = _redact_secret(str(exc), api_key)
            continue

        if resp.status_code == 404:
            continue
        if resp.status_code in (401, 403):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "error": {
                        "code": "AI_PROVIDER_ERROR",
                        "message": "Local AI audio transcription endpoint rejected the API key.",
                    }
                },
            )
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "error": {
                        "code": "AI_PROVIDER_ERROR",
                        "message": f"Audio transcription model '{stt_model}' returned HTTP {resp.status_code}.",
                    }
                },
            )
        try:
            payload = resp.json()
            text = (payload.get("text") or "").strip() if isinstance(payload, dict) else ""
        except Exception:
            text = resp.text.strip()
        if not text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "error": {
                        "code": "AI_EMPTY_RESPONSE",
                        "message": "Voice transcription returned empty text. Try speaking more clearly or typing your prompt.",
                    }
                },
            )
        return text

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={
            "error": {
                "code": "AI_PROVIDER_ERROR",
                "message": last_err or "Could not reach /audio/transcriptions endpoint on your local LLM server.",
            }
        },
    )


def _call_local_llm_structured(
    *,
    base_url: str,
    model_name: str,
    api_key: Optional[str],
    stt_model: Optional[str],
    response_model: Type[TModel],
    json_schema: Dict[str, Any],
    system_instruction: str,
    text_prompt: str,
    audio_bytes: Optional[bytes] = None,
    audio_mime_type: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
    image_mime_type: Optional[str] = None,
    temperature: float = 0.2,
    max_output_tokens: int = 4096,
    http_client_factory: Optional[Callable[[], httpx.Client]] = None,
) -> TModel:
    """Call an OpenAI-compatible Local LLM (Ollama, LM Studio, llama.cpp, vLLM, etc.) with structured JSON parsing."""
    normalized_url = normalize_local_base_url(base_url)
    factory = http_client_factory or _create_httpx_client
    effective_prompt = text_prompt

    with factory() as client:
        content_blocks: List[Dict[str, Any]] = []
        if audio_bytes:
            if not audio_mime_type:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": {"code": "INVALID_AUDIO", "message": "Audio MIME type is required."}},
                )
            if stt_model:
                transcript = _transcribe_audio_with_local_stt(
                    client,
                    base_url=normalized_url,
                    api_key=api_key,
                    stt_model=stt_model,
                    audio_bytes=audio_bytes,
                    audio_mime_type=audio_mime_type,
                )
                effective_prompt = f"{effective_prompt}\n\nVoice transcript:\n{transcript}"
            else:
                fmt = AUDIO_MIME_TO_FORMAT.get(audio_mime_type, "webm")
                content_blocks.append(
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": base64.b64encode(audio_bytes).decode("ascii"),
                            "format": fmt,
                        },
                    }
                )

        if image_bytes:
            if not image_mime_type:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": {"code": "INVALID_IMAGE", "message": "Image MIME type is required."}},
                )
            content_blocks.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": _prepare_image_data_url(image_bytes, image_mime_type),
                    },
                }
            )

        user_content: Any
        if content_blocks:
            user_content = [{"type": "text", "text": effective_prompt}, *content_blocks]
        else:
            user_content = effective_prompt

        local_system = (
            f"{system_instruction}\n\n"
            "STRICT JSON OUTPUT REQUIREMENT:\n"
            "Return ONLY a single raw valid JSON object (no markdown fences, no commentary) matching this JSON Schema:\n"
            f"{json.dumps(json_schema)}"
        )

        messages = [
            {"role": "system", "content": local_system},
            {"role": "user", "content": user_content},
        ]

        headers = {**_local_headers(api_key), "Content-Type": "application/json"}
        candidates = _endpoint_candidates(normalized_url, "/chat/completions")

        response_formats: List[Optional[Dict[str, Any]]] = [
            {
                "type": "json_schema",
                "json_schema": {
                    "name": response_model.__name__,
                    "schema": json_schema,
                },
            },
            {"type": "json_object"},
            None,
        ]

        raw_text = ""
        last_error_msg: Optional[str] = None
        had_connect_error = False

        for url in candidates:
            url_not_found = False
            for fmt in response_formats:
                payload: Dict[str, Any] = {
                    "model": model_name,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_output_tokens,
                    "stream": False,
                }
                if fmt is not None:
                    payload["response_format"] = fmt

                try:
                    resp = client.post(url, headers=headers, json=payload)
                except Exception as exc:
                    had_connect_error = True
                    last_error_msg = _redact_secret(str(exc), api_key)
                    break

                if resp.status_code == 404:
                    err_text = _redact_secret(resp.text[:400], api_key)
                    if "model" in err_text.lower():
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail={
                                "error": {
                                    "code": "AI_PROVIDER_ERROR",
                                    "message": f"Model '{model_name}' was not found on the local LLM server. Click Fetch Models in Settings to choose an available model.",
                                }
                            },
                        )
                    url_not_found = True
                    last_error_msg = f"Endpoint not found (HTTP 404) at {url}"
                    break

                if resp.status_code in (401, 403):
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "error": {
                                "code": "AI_PROVIDER_ERROR",
                                "message": "Local / OpenAI-compatible API rejected the API key. Check your credentials in Settings.",
                            }
                        },
                    )

                if resp.status_code == 429:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "error": {
                                "code": "AI_PROVIDER_ERROR",
                                "message": "LLM rate limit reached. Please wait a moment and try again.",
                            }
                        },
                    )

                if resp.status_code >= 400:
                    err_text = _redact_secret(resp.text[:400], api_key)
                    lower = err_text.lower()
                    if any(tok in lower for tok in ("input_audio", "audio", "modality")):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail={
                                "error": {
                                    "code": "UNSUPPORTED_AUDIO_BY_LOCAL_MODEL",
                                    "message": "This local model does not accept raw audio directly. Type your prompt, configure a Whisper STT model in Settings, or use Gemini AI.",
                                }
                            },
                        )
                    if resp.status_code in (400, 422) and fmt is not None and any(
                        tok in lower for tok in ("response_format", "json_schema", "json_object", "schema")
                    ):
                        # Try next simpler response_format tier
                        last_error_msg = err_text
                        continue
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "error": {
                                "code": "AI_PROVIDER_ERROR",
                                "message": f"LLM server returned HTTP {resp.status_code}: {err_text}",
                            }
                        },
                    )

                try:
                    data = resp.json()
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "error": {
                                "code": "AI_INVALID_RESPONSE",
                                "message": "LLM server returned non-JSON HTTP response.",
                            }
                        },
                    ) from exc

                raw_text = _extract_openai_message_text(data)
                break

            if raw_text or not url_not_found:
                break

        if not raw_text.strip() and had_connect_error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "error": {
                        "code": "AI_PROVIDER_ERROR",
                        "message": f"Could not reach Local LLM at {normalized_url}. Check that your LLM server is running.",
                    }
                },
            )
        if not raw_text.strip():
            if last_error_msg:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "error": {
                            "code": "AI_PROVIDER_ERROR",
                            "message": f"Could not get a valid response from Local LLM at {normalized_url}: {last_error_msg}",
                        }
                    },
                )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "error": {
                        "code": "AI_EMPTY_RESPONSE",
                        "message": "AI returned an empty response. Please try again with clearer details.",
                    }
                },
            )

    try:
        return response_model.model_validate_json(strip_json_fences(raw_text))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "AI_INVALID_RESPONSE",
                    "message": "Local LLM returned JSON that did not match the expected structure. Try a more capable instruction model or retry.",
                }
            },
        ) from exc


def call_gemini_structured(
    db: Session,
    *,
    response_model: Type[TModel],
    json_schema: Dict[str, Any],
    system_instruction: str,
    text_prompt: str,
    audio_bytes: Optional[bytes] = None,
    audio_mime_type: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
    image_mime_type: Optional[str] = None,
    temperature: float = 0.2,
    max_output_tokens: int = 4096,
    client_factory: Optional[Callable[[str], genai.Client]] = None,
    http_client_factory: Optional[Callable[[], httpx.Client]] = None,
) -> TModel:
    """Execute a multimodal (text + audio + image) structured call via active AI provider (Gemini API or Local LLM)."""
    if audio_bytes is not None and len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "AUDIO_TOO_LARGE",
                    "message": "Voice message is too large (maximum 15 MB). Please keep recordings brief.",
                }
            },
        )
    if image_bytes is not None and len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "IMAGE_TOO_LARGE",
                    "message": "Image is too large (maximum 15 MB). Please choose a smaller photo.",
                }
            },
        )

    cfg = get_ai_config_status(db)

    if cfg.provider == "local":
        if not cfg.local_llm_base_url or not cfg.local_llm_model:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": {
                        "code": "AI_NOT_CONFIGURED",
                        "message": "Local LLM is selected, but Base URL or Model Name is missing. Ask an admin to configure Local LLM in Settings.",
                    }
                },
            )
        return _call_local_llm_structured(
            base_url=cfg.local_llm_base_url,
            model_name=cfg.local_llm_model,
            api_key=cfg.local_llm_api_key,
            stt_model=cfg.local_llm_stt_model,
            response_model=response_model,
            json_schema=json_schema,
            system_instruction=system_instruction,
            text_prompt=text_prompt,
            audio_bytes=audio_bytes,
            audio_mime_type=audio_mime_type,
            image_bytes=image_bytes,
            image_mime_type=image_mime_type,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            http_client_factory=http_client_factory,
        )

    api_key = cfg.gemini_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "AI_NOT_CONFIGURED",
                    "message": "AI is not configured yet. Ask an admin to add a Gemini API key or Local LLM in Settings.",
                }
            },
        )

    input_blocks: List[Dict[str, Any]] = [{"type": "text", "text": text_prompt}]
    if audio_bytes:
        if not audio_mime_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "INVALID_AUDIO", "message": "Audio MIME type is required."}},
            )
        input_blocks.append(
            {
                "type": "audio",
                "data": base64.b64encode(audio_bytes).decode("ascii"),
                "mime_type": audio_mime_type,
            }
        )
    if image_bytes:
        if not image_mime_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "INVALID_IMAGE", "message": "Image MIME type is required."}},
            )
        input_blocks.append(
            {
                "type": "image",
                "data": base64.b64encode(image_bytes).decode("ascii"),
                "mime_type": image_mime_type,
            }
        )

    factory = client_factory or _create_genai_client
    client = factory(api_key)
    try:
        interaction = client.interactions.create(
            model=cfg.gemini_model,
            input=input_blocks,
            system_instruction=system_instruction,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": json_schema,
            },
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
            },
            store=False,
        )
    except genai_errors.APIError as exc:
        msg = "Gemini API request failed."
        if getattr(exc, "code", None) in (401, 403):
            msg = "Gemini API key was rejected. Please check your key in Settings."
        elif getattr(exc, "code", None) == 429:
            msg = "Gemini API rate limit reached. Please wait a moment and try again."
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": {"code": "AI_PROVIDER_ERROR", "message": msg}},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "AI_PROVIDER_ERROR",
                    "message": "Could not reach Gemini API. Check your internet connection and API key.",
                }
            },
        ) from exc

    raw_text = getattr(interaction, "output_text", None) or ""
    if not raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "AI_EMPTY_RESPONSE",
                    "message": "AI returned an empty response. Please try again with clearer details.",
                }
            },
        )

    try:
        return response_model.model_validate_json(strip_json_fences(raw_text))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "AI_INVALID_RESPONSE",
                    "message": "AI returned an unexpected format. Please try again.",
                }
            },
        ) from exc


def fetch_local_models(
    db: Session,
    *,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    http_client_factory: Optional[Callable[[], httpx.Client]] = None,
) -> Tuple[str, List[str]]:
    """Query /models (or Ollama /api/tags fallback) to discover available local LLM model IDs."""
    cfg = get_ai_config_status(db)
    resolved_url = normalize_local_base_url(base_url or cfg.local_llm_base_url or "")
    resolved_key = api_key if (api_key and api_key.strip()) else cfg.local_llm_api_key
    headers = _local_headers(resolved_key)
    factory = http_client_factory or (lambda: httpx.Client(timeout=10.0))

    discovered: List[str] = []
    last_error: Optional[str] = None

    with factory() as client:
        for url in _endpoint_candidates(resolved_url, "/models"):
            try:
                resp = client.get(url, headers=headers)
            except Exception as exc:
                last_error = _redact_secret(str(exc), resolved_key)
                continue

            if resp.status_code == 404:
                continue
            if resp.status_code in (401, 403):
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "error": {
                            "code": "AI_PROVIDER_ERROR",
                            "message": "Local LLM server rejected the API key when listing models.",
                        }
                    },
                )
            if resp.status_code >= 400:
                last_error = f"HTTP {resp.status_code}"
                continue
            try:
                data = resp.json()
            except Exception:
                continue
            if isinstance(data, dict) and isinstance(data.get("data"), list):
                for entry in data["data"]:
                    mid = entry.get("id") if isinstance(entry, dict) else None
                    if isinstance(mid, str) and mid.strip() and mid.strip() not in discovered:
                        discovered.append(mid.strip())
                break

        # Fallback: Ollama native /api/tags
        if not discovered:
            parsed = urlparse(resolved_url)
            root = f"{parsed.scheme}://{parsed.netloc}"
            try:
                resp = client.get(f"{root}/api/tags", headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    for entry in data.get("models", []) if isinstance(data, dict) else []:
                        name = entry.get("name") if isinstance(entry, dict) else None
                        if isinstance(name, str) and name.strip() and name.strip() not in discovered:
                            discovered.append(name.strip())
            except Exception as exc:
                if not last_error:
                    last_error = _redact_secret(str(exc), resolved_key)

    if not discovered and last_error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "AI_PROVIDER_ERROR",
                    "message": f"Could not fetch models from {resolved_url}: {last_error}",
                }
            },
        )
    return resolved_url, discovered


def test_ai_connection(
    db: Session,
    *,
    provider: Optional[Literal["gemini", "local"]] = None,
    gemini_api_key: Optional[str] = None,
    gemini_model: Optional[str] = None,
    local_llm_base_url: Optional[str] = None,
    local_llm_model: Optional[str] = None,
    local_llm_api_key: Optional[str] = None,
    client_factory: Optional[Callable[[str], genai.Client]] = None,
    http_client_factory: Optional[Callable[[], httpx.Client]] = None,
) -> Dict[str, Any]:
    """Run a lightweight end-to-end health check against Gemini or a Local LLM."""
    cfg = get_ai_config_status(db)
    target_provider: Literal["gemini", "local"] = provider or cfg.provider
    started = time.perf_counter()

    if target_provider == "local":
        base_url = normalize_local_base_url(
            local_llm_base_url or cfg.local_llm_base_url or ""
        )
        model_name = (local_llm_model or cfg.local_llm_model or "").strip()
        if not model_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "AI_NOT_CONFIGURED",
                        "message": "Enter a Local LLM model name before testing the connection.",
                    }
                },
            )
        resolved_key = (
            local_llm_api_key.strip()
            if (local_llm_api_key and local_llm_api_key.strip())
            else cfg.local_llm_api_key
        )
        _call_local_llm_structured(
            base_url=base_url,
            model_name=model_name,
            api_key=resolved_key,
            stt_model=None,
            response_model=_PingSchema,
            json_schema=inline_json_schema(_PingSchema),
            system_instruction="Respond with JSON {\"ok\": true}.",
            text_prompt="Health check. Reply with {\"ok\": true}.",
            temperature=0.0,
            max_output_tokens=64,
            http_client_factory=http_client_factory,
        )
        elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))
        return {
            "ok": True,
            "provider": "local",
            "model": model_name,
            "latency_ms": elapsed_ms,
            "message": f"Connected to {model_name} at {base_url} ({elapsed_ms} ms).",
        }

    resolved_gemini_key = (
        gemini_api_key.strip()
        if (gemini_api_key and gemini_api_key.strip())
        else cfg.gemini_api_key
    )
    resolved_model = (gemini_model or cfg.gemini_model or GEMINI_MODEL).strip()
    if not resolved_gemini_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "AI_NOT_CONFIGURED",
                    "message": "Enter a Gemini API key (or configure GEMINI_API_KEY) before testing.",
                }
            },
        )
    factory = client_factory or _create_genai_client
    client = factory(resolved_gemini_key)
    try:
        interaction = client.interactions.create(
            model=resolved_model,
            input=[{"type": "text", "text": "Reply with JSON {\"ok\": true}."}],
            system_instruction="Return only JSON {\"ok\": true}.",
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": inline_json_schema(_PingSchema),
            },
            generation_config={"temperature": 0.0, "max_output_tokens": 64},
            store=False,
        )
    except genai_errors.APIError as exc:
        msg = "Gemini API request failed."
        if getattr(exc, "code", None) in (401, 403):
            msg = "Gemini API key was rejected. Please check your key."
        elif getattr(exc, "code", None) == 429:
            msg = "Gemini API rate limit reached."
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": {"code": "AI_PROVIDER_ERROR", "message": msg}},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "AI_PROVIDER_ERROR",
                    "message": "Could not reach Gemini API. Check your internet connection and API key.",
                }
            },
        ) from exc

    raw_text = getattr(interaction, "output_text", None) or ""
    if not raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "AI_EMPTY_RESPONSE",
                    "message": "Gemini returned an empty health-check response.",
                }
            },
        )
    _PingSchema.model_validate_json(strip_json_fences(raw_text))
    elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))
    return {
        "ok": True,
        "provider": "gemini",
        "model": resolved_model,
        "latency_ms": elapsed_ms,
        "message": f"Connected to Gemini ({resolved_model}) in {elapsed_ms} ms.",
    }
