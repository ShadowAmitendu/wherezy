import base64
import io
import json
from types import SimpleNamespace

from sqlalchemy import text

from backend.app.core.security import SESSION_COOKIE_NAME, create_session_token
from backend.app.services import gemini_shared


TINY_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)
TINY_WAV_BYTES = b"RIFF\x24\x00\x00\x00WAVEfmt "


class _FakeResponse:
    def __init__(self, status_code: int, payload=None, text_body: str = ""):
        self.status_code = status_code
        self._payload = payload
        if text_body:
            self.text = text_body
        elif payload is not None:
            self.text = json.dumps(payload)
        else:
            self.text = ""

    def json(self):
        if self._payload is not None:
            return self._payload
        return json.loads(self.text)


class _FakeHttpxClient:
    def __init__(self, get_handler=None, post_handler=None):
        self._get_handler = get_handler
        self._post_handler = post_handler

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, headers=None, **kwargs):
        if self._get_handler is None:
            raise AssertionError(f"Unexpected GET {url}")
        return self._get_handler(url, headers or {}, **kwargs)

    def post(self, url, json=None, data=None, files=None, headers=None, **kwargs):
        if self._post_handler is None:
            raise AssertionError(f"Unexpected POST {url}")
        return self._post_handler(url, json=json, data=data, files=files, headers=headers or {}, **kwargs)


def test_local_llm_settings_roundtrip_and_encryption(client, db_session):
    secret = "sk-local-secret-9999"
    res = client.put(
        "/api/settings",
        json={
            "ai_provider": "local",
            "gemini_model": "gemini-3.8-flash",
            "local_llm_base_url": "http://127.0.0.1:11434/v1/",
            "local_llm_model": "qwen2.5:7b-instruct",
            "local_llm_stt_model": "whisper-1",
            "local_llm_api_key": secret,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ai_provider"] == "local"
    assert body["ai_configured"] is True
    assert body["local_llm_base_url"] == "http://127.0.0.1:11434/v1"
    assert body["local_llm_model"] == "qwen2.5:7b-instruct"
    assert body["local_llm_stt_model"] == "whisper-1"
    assert body["local_llm_has_api_key"] is True
    assert body["local_llm_api_key_hint"] is not None
    assert "9999" in body["local_llm_api_key_hint"]
    assert secret not in json.dumps(body)

    row = db_session.execute(
        text("SELECT value_json FROM settings WHERE key = :k"),
        {"k": gemini_shared.LOCAL_LLM_API_KEY_SETTING},
    ).fetchone()
    assert row is not None
    assert secret not in row[0]

    # Clear optional API key; keyless local LLM should still report configured.
    res = client.put("/api/settings", json={"clear_local_llm_api_key": True})
    assert res.status_code == 200
    body = res.json()
    assert body["local_llm_has_api_key"] is False
    assert body["local_llm_api_key_hint"] is None
    assert body["ai_configured"] is True

    # Removing the model marks local AI as unconfigured.
    res = client.put("/api/settings", json={"local_llm_model": ""})
    assert res.status_code == 200
    assert res.json()["ai_configured"] is False

    # Reject non-HTTP base URL.
    bad = client.put("/api/settings", json={"local_llm_base_url": "ftp://bad.local/v1"})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "INVALID_AI_URL"


def test_ai_config_endpoints_require_admin_settings_permission(client, anon_client):
    created = client.post(
        "/api/profiles",
        json={"name": "Member User", "username": "member1", "pin": "1234", "role": "member"},
    )
    assert created.status_code == 200, created.text
    member_id = created.json()["id"]

    member_token = create_session_token(
        {"authenticated": True, "profile_id": member_id, "role": "member", "username": "member1"}
    )
    anon_client.cookies.clear()

    for path, payload in (
        ("/api/ai/config/models", {"base_url": "http://127.0.0.1:11434/v1"}),
        (
            "/api/ai/config/test",
            {
                "provider": "local",
                "local_llm_base_url": "http://127.0.0.1:11434/v1",
                "local_llm_model": "llama3.2",
            },
        ),
    ):
        r_anon = anon_client.post(path, json=payload)
        assert r_anon.status_code == 401

        anon_client.cookies.set(SESSION_COOKIE_NAME, member_token)
        r_member = anon_client.post(path, json=payload)
        assert r_member.status_code == 403
        anon_client.cookies.clear()


def test_fetch_local_models_openai_and_ollama_fallback(client, monkeypatch):
    calls = []

    def fake_factory_openai(*args, **kwargs):
        def _get(url, headers, **kw):
            calls.append(url)
            return _FakeResponse(200, {"data": [{"id": "qwen2.5:7b"}, {"id": "llama3.2:latest"}]})

        return _FakeHttpxClient(get_handler=_get)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_factory_openai)
    r = client.post("/api/ai/config/models", json={"base_url": "http://127.0.0.1:11434"})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["base_url"] == "http://127.0.0.1:11434"
    assert r.json()["models"] == ["llama3.2:latest", "qwen2.5:7b"]
    assert calls[0].endswith("/v1/models")

    # Now simulate /v1/models 404 -> Ollama native /api/tags fallback
    calls.clear()

    def fake_factory_ollama(*args, **kwargs):
        def _get(url, headers, **kw):
            calls.append(url)
            if url.endswith("/v1/models"):
                return _FakeResponse(404, {"error": "not found"})
            if url.endswith("/api/tags"):
                return _FakeResponse(200, {"models": [{"name": "mistral:7b"}, {"model": "phi4"}]})
            return _FakeResponse(404, {"error": "unknown"})

        return _FakeHttpxClient(get_handler=_get)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_factory_ollama)
    r2 = client.post("/api/ai/config/models", json={"base_url": "http://127.0.0.1:11434/v1"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["models"] == ["mistral:7b", "phi4"]
    assert any(u.endswith("/api/tags") for u in calls)


def test_local_llm_category_generation_think_strip_and_schema_fallback(client, monkeypatch):
    res = client.put(
        "/api/settings",
        json={
            "ai_provider": "local",
            "local_llm_base_url": "http://127.0.0.1:11434",
            "local_llm_model": "deepseek-r1:8b",
        },
    )
    assert res.status_code == 200

    seen_formats = []
    seen_urls = []

    category_payload = {
        "name": "Pantry Staples",
        "icon": "kitchen",
        "color": "#2e7d32",
        "track_expiry": True,
        "expiry_label": "Best before",
        "optimization_summary": "Tracks dry goods with weight, brand, and seal status.",
        "fields": [
            {"label": "Brand", "type": "text", "required": False, "options": [], "unit": "", "hint": "Barilla", "show_in_list": True},
            {"label": "Weight", "type": "number", "required": False, "options": [], "unit": "g", "hint": "500", "show_in_list": True},
            {"label": "Opened", "type": "checkbox", "required": False, "options": [], "unit": "", "hint": "", "show_in_list": False},
        ],
    }

    def fake_factory(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            seen_urls.append(url)
            fmt = (json or {}).get("response_format", {}).get("type")
            seen_formats.append(fmt)
            if fmt == "json_schema":
                return _FakeResponse(400, {"error": {"message": "json_schema response_format is unsupported"}})
            content = (
                "<think>Let me think carefully about pantry fields.</think>\n"
                f"```json\n{__import__('json').dumps(category_payload)}\n```"
            )
            return _FakeResponse(200, {"choices": [{"message": {"content": content}}]})

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_factory)

    gen = client.post(
        "/api/categories/ai/generate",
        data={"prompt": "Pantry staples like pasta, lentils, and spices", "create": "false"},
    )
    assert gen.status_code == 200, gen.text
    data = gen.json()
    assert data["created"] is False
    assert data["plan"]["name"] == "Pantry Staples"
    assert data["plan"]["track_expiry"] is True
    assert len(data["plan"]["fields"]) == 3
    assert seen_formats == ["json_schema", "json_object"]
    assert all(u == "http://127.0.0.1:11434/v1/chat/completions" for u in seen_urls)


def test_local_llm_audio_whisper_and_unsupported_error(client, monkeypatch):
    client.put(
        "/api/settings",
        json={
            "ai_provider": "local",
            "local_llm_base_url": "http://127.0.0.1:1234/v1",
            "local_llm_model": "qwen2.5-vl-7b",
            "local_llm_stt_model": "",
        },
    )

    def fake_reject_audio(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            return _FakeResponse(400, {"error": {"message": "audio input_audio not supported by this model"}})

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_reject_audio)
    bad = client.post(
        "/api/categories/ai/generate",
        data={"create": "false"},
        files={"audio": ("voice.wav", io.BytesIO(TINY_WAV_BYTES), "audio/wav")},
    )
    assert bad.status_code == 400, bad.text
    assert bad.json()["error"]["code"] == "UNSUPPORTED_AUDIO_BY_LOCAL_MODEL"

    # Now enable a Whisper STT model and confirm audio transcription feeds into chat completions
    client.put("/api/settings", json={"local_llm_stt_model": "whisper-1"})
    chat_user_texts = []

    def fake_whisper_then_chat(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            if url.endswith("/audio/transcriptions"):
                assert data["model"] == "whisper-1"
                return _FakeResponse(200, {"text": "Board games and card decks collection"})
            content = (json or {}).get("messages", [])[-1].get("content")
            if isinstance(content, str):
                chat_user_texts.append(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        chat_user_texts.append(part.get("text", ""))
            payload = {
                "name": "Board Games",
                "icon": "toys",
                "color": "#1976d2",
                "track_expiry": False,
                "expiry_label": "",
                "optimization_summary": "Tracks board and card games.",
                "fields": [
                    {"label": "Players", "type": "text", "required": False, "options": [], "unit": "", "hint": "2-4", "show_in_list": True},
                    {"label": "Playtime", "type": "number", "required": False, "options": [], "unit": "min", "hint": "45", "show_in_list": True},
                    {"label": "Condition", "type": "dropdown", "required": False, "options": ["Mint", "Good"], "unit": "", "hint": "", "show_in_list": False},
                ],
            }
            return _FakeResponse(200, {"choices": [{"message": {"content": __import__("json").dumps(payload)}}]})

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_whisper_then_chat)
    ok = client.post(
        "/api/categories/ai/generate",
        data={"create": "false"},
        files={"audio": ("voice.wav", io.BytesIO(TINY_WAV_BYTES), "audio/wav")},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["plan"]["name"] == "Board Games"
    assert any("Board games and card decks collection" in t for t in chat_user_texts)


def test_local_llm_item_extract_with_image_and_secret_redaction(client, monkeypatch):
    secret = "sk-top-secret-xyz123"
    client.put(
        "/api/settings",
        json={
            "ai_provider": "local",
            "local_llm_base_url": "https://api.example.com/v1",
            "local_llm_model": "gpt-4o-mini",
            "local_llm_api_key": secret,
        },
    )

    seen_auth = []
    seen_image_urls = []

    def fake_vision_ok(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            seen_auth.append((headers or {}).get("Authorization"))
            content = (json or {}).get("messages", [])[-1].get("content", [])
            for part in content:
                if isinstance(part, dict) and part.get("type") == "image_url":
                    seen_image_urls.append(part["image_url"]["url"])
            suggestion = {
                "name": "Duracell AA Batteries",
                "category_id": None,
                "location_id": None,
                "quantity": 8,
                "expiry_date": "",
                "notes": "8-pack alkaline cells",
                "field_values": [],
                "summary": "Extracted pack of 8 AA batteries.",
            }
            return _FakeResponse(200, {"choices": [{"message": {"content": __import__("json").dumps(suggestion)}}]})

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_vision_ok)
    res = client.post(
        "/api/ai/item/extract",
        data={"prompt": "Pack of 8 AA batteries"},
        files={"image": ("batteries.png", io.BytesIO(TINY_PNG_BYTES), "image/png")},
    )
    assert res.status_code == 200, res.text
    assert res.json()["suggestion"]["name"] == "Duracell AA Batteries"
    assert res.json()["suggestion"]["quantity"] == 8
    assert seen_auth == [f"Bearer {secret}"]
    assert len(seen_image_urls) == 1 and seen_image_urls[0].startswith("data:image/png;base64,")

    # Upstream error echoing secret must NEVER leak secret back to client.
    def fake_error_echo(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            return _FakeResponse(500, text_body=f"Upstream failure for token {secret}")

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_error_echo)
    fail = client.post("/api/ai/item/extract", data={"prompt": "Batteries"})
    assert fail.status_code == 502
    assert secret not in fail.text


def test_ai_connection_test_endpoint_local_and_gemini(client, monkeypatch):
    def fake_local_ping(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            return _FakeResponse(200, {"choices": [{"message": {"content": '{"ok": true}'}}]})

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_local_ping)
    res_local = client.post(
        "/api/ai/config/test",
        json={
            "provider": "local",
            "local_llm_base_url": "http://127.0.0.1:11434/v1",
            "local_llm_model": "llama3.2",
        },
    )
    assert res_local.status_code == 200, res_local.text
    assert res_local.json()["ok"] is True
    assert res_local.json()["provider"] == "local"
    assert res_local.json()["model"] == "llama3.2"

    class _FakeGenAiInteractions:
        def create(self, **kwargs):
            return SimpleNamespace(output_text='{"ok": true}')

    class _FakeGenAiClient:
        interactions = _FakeGenAiInteractions()

    monkeypatch.setattr(gemini_shared, "_create_genai_client", lambda api_key: _FakeGenAiClient())
    res_gem = client.post(
        "/api/ai/config/test",
        json={
            "provider": "gemini",
            "gemini_api_key": "AIzaFakeKeyForTest12345",
            "gemini_model": "gemini-3.8-flash",
        },
    )
    assert res_gem.status_code == 200, res_gem.text
    assert res_gem.json()["ok"] is True
    assert res_gem.json()["provider"] == "gemini"
    assert res_gem.json()["model"] == "gemini-3.8-flash"


def test_local_llm_disables_reasoning_with_fallback(client, monkeypatch):
    seen_payloads = []

    def fake_local_fallback(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            seen_payloads.append(dict(json or {}))
            if "reasoning_effort" in (json or {}):
                return _FakeResponse(400, text_body="Unknown parameter: reasoning_effort")
            return _FakeResponse(200, {"choices": [{"message": {"content": '{"ok": true}'}}]})

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_local_fallback)
    res = client.post(
        "/api/ai/config/test",
        json={
            "provider": "local",
            "local_llm_base_url": "http://127.0.0.1:11434/v1",
            "local_llm_model": "gemma4:e2b",
        },
    )
    assert res.status_code == 200, res.text
    assert len(seen_payloads) == 2
    assert seen_payloads[0].get("reasoning_effort") == "none"
    assert seen_payloads[0].get("max_tokens") == 512
    assert "reasoning_effort" not in seen_payloads[1]


def test_local_llm_api_path_falls_back_to_v1(client, monkeypatch):
    seen_urls = []

    def fake_api_then_v1(*args, **kwargs):
        def _post(url, json=None, data=None, files=None, headers=None, **kw):
            seen_urls.append(url)
            if url.endswith("/api/chat/completions"):
                return _FakeResponse(404, text_body="404 page not found")
            return _FakeResponse(200, {"choices": [{"message": {"content": '{"ok": true}'}}]})

        return _FakeHttpxClient(post_handler=_post)

    monkeypatch.setattr(gemini_shared, "_create_httpx_client", fake_api_then_v1)
    res = client.post(
        "/api/ai/config/test",
        json={
            "provider": "local",
            "local_llm_base_url": "http://localhost:11434/api",
            "local_llm_model": "gemma4:e2b",
        },
    )
    assert res.status_code == 200, res.text
    assert seen_urls == [
        "http://localhost:11434/api/chat/completions",
        "http://localhost:11434/v1/chat/completions",
    ]
