import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Setting, Profile
from backend.app.schemas import SettingsResponse, SettingsUpdateRequest, PrintDefaults
from backend.app.services.gemini_shared import (
    AI_PROVIDER_KEY,
    GEMINI_MODEL_KEY,
    LOCAL_LLM_BASE_URL_KEY,
    LOCAL_LLM_MODEL_KEY,
    LOCAL_LLM_STT_MODEL_KEY,
    clear_gemini_api_key,
    clear_local_llm_api_key,
    get_ai_config_status,
    normalize_local_base_url,
    save_gemini_api_key,
    save_local_llm_api_key,
    set_ai_str_setting,
)
from backend.app.services.permissions import require

router = APIRouter(prefix="/settings", tags=["Settings"])

DEFAULT_SETTINGS = {
    "expiry_warn_days": 30,
    "base_url": None,
    "label_preset": "medium",
    "print_defaults": {
        "include_sub": True,
        "show_photos": True,
        "show_audit_box": True,
        "font_size": "medium"
    },
    "theme": "system",
    "backup_keep": 7,
    "photo_limit_per_owner": 10
}

def get_setting_val(db: Session, key: str, default: any):
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row:
        return default
    try:
        return json.loads(row.value_json)
    except Exception:
        return default

def set_setting_val(db: Session, key: str, value: any):
    row = db.query(Setting).filter(Setting.key == key).first()
    val_json = json.dumps(value)
    if not row:
        row = Setting(key=key, value_json=val_json)
        db.add(row)
    else:
        row.value_json = val_json

def _build_settings_response(db: Session) -> SettingsResponse:
    warn_days = get_setting_val(db, "expiry_warn_days", DEFAULT_SETTINGS["expiry_warn_days"])
    base_url = get_setting_val(db, "base_url", DEFAULT_SETTINGS["base_url"])
    label_preset = get_setting_val(db, "label_preset", DEFAULT_SETTINGS["label_preset"])
    print_defaults_raw = get_setting_val(db, "print_defaults", DEFAULT_SETTINGS["print_defaults"])
    theme = get_setting_val(db, "theme", DEFAULT_SETTINGS["theme"])
    backup_keep = get_setting_val(db, "backup_keep", DEFAULT_SETTINGS["backup_keep"])
    photo_limit = get_setting_val(db, "photo_limit_per_owner", DEFAULT_SETTINGS["photo_limit_per_owner"])
    ai_cfg = get_ai_config_status(db)

    return SettingsResponse(
        expiry_warn_days=int(warn_days),
        base_url=base_url,
        label_preset=str(label_preset),
        print_defaults=PrintDefaults(**print_defaults_raw) if isinstance(print_defaults_raw, dict) else PrintDefaults(),
        theme=str(theme),
        backup_keep=int(backup_keep),
        photo_limit_per_owner=int(photo_limit),
        ai_configured=ai_cfg.ai_configured,
        ai_provider=ai_cfg.provider,
        ai_status_label=ai_cfg.status_label,
        ai_key_source=ai_cfg.gemini_key_source,
        gemini_api_key_hint=ai_cfg.gemini_api_key_hint,
        gemini_model=ai_cfg.gemini_model,
        local_llm_base_url=ai_cfg.local_llm_base_url,
        local_llm_model=ai_cfg.local_llm_model,
        local_llm_has_api_key=bool(ai_cfg.local_llm_api_key),
        local_llm_api_key_hint=ai_cfg.local_llm_api_key_hint,
        local_llm_stt_model=ai_cfg.local_llm_stt_model,
    )

@router.get("", response_model=SettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    return _build_settings_response(db)

@router.put("", response_model=SettingsResponse)
def update_settings(
    payload: SettingsUpdateRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:settings"))
):
    if payload.expiry_warn_days is not None:
        set_setting_val(db, "expiry_warn_days", payload.expiry_warn_days)
    if payload.base_url is not None:
        set_setting_val(db, "base_url", payload.base_url.strip() if payload.base_url else None)
    if payload.label_preset is not None:
        set_setting_val(db, "label_preset", payload.label_preset)
    if payload.print_defaults is not None:
        set_setting_val(db, "print_defaults", payload.print_defaults.model_dump())
    if payload.theme is not None:
        set_setting_val(db, "theme", payload.theme)
    if payload.backup_keep is not None:
        set_setting_val(db, "backup_keep", payload.backup_keep)
    if payload.photo_limit_per_owner is not None:
        set_setting_val(db, "photo_limit_per_owner", payload.photo_limit_per_owner)
    if payload.ai_provider is not None:
        set_setting_val(db, AI_PROVIDER_KEY, payload.ai_provider)
    if payload.gemini_model is not None:
        set_ai_str_setting(db, GEMINI_MODEL_KEY, payload.gemini_model)
    if payload.clear_gemini_api_key:
        clear_gemini_api_key(db)
    elif payload.gemini_api_key is not None and payload.gemini_api_key.strip():
        save_gemini_api_key(db, payload.gemini_api_key)

    if payload.local_llm_base_url is not None:
        cleaned_url = payload.local_llm_base_url.strip()
        if cleaned_url:
            set_ai_str_setting(db, LOCAL_LLM_BASE_URL_KEY, normalize_local_base_url(cleaned_url))
        else:
            set_ai_str_setting(db, LOCAL_LLM_BASE_URL_KEY, None)
    if payload.local_llm_model is not None:
        set_ai_str_setting(db, LOCAL_LLM_MODEL_KEY, payload.local_llm_model)
    if payload.local_llm_stt_model is not None:
        set_ai_str_setting(db, LOCAL_LLM_STT_MODEL_KEY, payload.local_llm_stt_model)
    if payload.clear_local_llm_api_key:
        clear_local_llm_api_key(db)
    elif payload.local_llm_api_key is not None and payload.local_llm_api_key.strip():
        save_local_llm_api_key(db, payload.local_llm_api_key)

    db.commit()
    return _build_settings_response(db)
