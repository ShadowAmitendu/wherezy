import base64
import json
from types import SimpleNamespace

from backend.app.core.security import create_session_token
from backend.app.models import Activity, Category, FieldDef, Profile, Setting
from backend.app.services import ai_category_service


class _FakeInteractions:
    def __init__(self, response_payload: dict, calls: list):
        self._payload = response_payload
        self._calls = calls

    def create(self, **kwargs):
        self._calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self._payload))


class _FakeGenaiClient:
    def __init__(self, response_payload: dict, calls: list):
        self.interactions = _FakeInteractions(response_payload, calls)


def test_ai_endpoints_require_auth_and_permission(anon_client, db_session):
    unauth_gen = anon_client.post("/api/categories/ai/generate", data={"prompt": "Tools"})
    assert unauth_gen.status_code == 401

    unauth_commit = anon_client.post(
        "/api/categories/ai/commit",
        json={"name": "Tools", "icon": "build", "color": "#1976d2", "track_expiry": False, "fields": []},
    )
    assert unauth_commit.status_code == 401

    viewer = Profile(name="AiViewer", username="aiviewer", role="viewer", is_active=1)
    member = Profile(name="AiMember", username="aimember", role="member", is_active=1)
    db_session.add_all([viewer, member])
    db_session.commit()

    for prof in (viewer, member):
        c = type(anon_client)(anon_client.app)
        c.cookies.set("hi_session", create_session_token({"profile_id": prof.id, "role": prof.role}))
        res = c.post("/api/categories/ai/generate", data={"prompt": "Tools"})
        assert res.status_code == 403


def test_ai_requires_configured_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    s_res = client.get("/api/settings")
    assert s_res.status_code == 200
    s_data = s_res.json()
    assert s_data["ai_configured"] is False
    assert s_data["ai_key_source"] == "none"
    assert s_data["gemini_api_key_hint"] is None

    res = client.post("/api/categories/ai/generate", data={"prompt": "Board games"})
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "AI_NOT_CONFIGURED"


def test_settings_gemini_key_is_encrypted_and_masked(client, db_session, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    secret_key = "AIzaSyTestSecretKey9876"
    upd = client.put("/api/settings", json={"gemini_api_key": secret_key})
    assert upd.status_code == 200
    body = upd.json()
    assert body["ai_configured"] is True
    assert body["ai_key_source"] == "settings"
    assert body["gemini_api_key_hint"] == "••••9876"
    assert secret_key not in json.dumps(body)

    # DB row must hold ciphertext, never plaintext
    row = db_session.query(Setting).filter(Setting.key == ai_category_service.GEMINI_SETTING_KEY).first()
    assert row is not None
    assert secret_key not in row.value_json

    got = client.get("/api/settings").json()
    assert got["ai_configured"] is True
    assert got["gemini_api_key_hint"] == "••••9876"
    assert secret_key not in json.dumps(got)

    cleared = client.put("/api/settings", json={"clear_gemini_api_key": True})
    assert cleared.status_code == 200
    cleared_body = cleared.json()
    assert cleared_body["ai_configured"] is False
    assert cleared_body["ai_key_source"] == "none"
    assert cleared_body["gemini_api_key_hint"] is None


def test_ai_input_validation_and_audio_mime_guard(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    empty_res = client.post("/api/categories/ai/generate", data={"prompt": "   "})
    assert empty_res.status_code == 400
    assert empty_res.json()["error"]["code"] == "EMPTY_AI_INPUT"

    bad_audio = client.post(
        "/api/categories/ai/generate",
        files={"audio": ("notes.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert bad_audio.status_code == 400
    assert bad_audio.json()["error"]["code"] == "UNSUPPORTED_AUDIO_FORMAT"

    too_big = b"0" * (ai_category_service.MAX_AUDIO_BYTES + 1)
    big_res = client.post(
        "/api/categories/ai/generate",
        files={"audio": ("big.webm", too_big, "audio/webm")},
    )
    assert big_res.status_code == 400
    assert big_res.json()["error"]["code"] == "AUDIO_TOO_LARGE"


def test_ai_generate_and_create_from_text_sanitizes_and_persists(client, db_session, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-env-key")
    calls = []
    fake_payload = {
        "name": "  Kitchen   Spices  ",
        "icon": "NOT_A_REAL_ICON",
        "color": "#INVALID",
        "track_expiry": True,
        "expiry_label": "Best before",
        "optimization_summary": "Structured culinary spices with origin, heat level, and net weight.",
        "fields": [
            {"label": "Quantity", "type": "number", "unit": "pcs", "show_in_list": True},
            {"label": "Expiry Date", "type": "date", "show_in_list": True},
            {"label": "Brand", "type": "text", "required": False, "unit": "ignored", "show_in_list": True},
            {"label": "brand", "type": "text", "required": False, "show_in_list": True},
            {"label": "Heat Level", "type": "dropdown", "options": ["Mild", "Mild", "Medium", "Hot"], "show_in_list": True},
            {"label": "Origin", "type": "dropdown", "options": [], "show_in_list": True},
            {"label": "Net Weight", "type": "number", "unit": "g", "show_in_list": True},
            {"label": "Container", "type": "text", "show_in_list": True},
            {"label": "Organic", "type": "checkbox", "show_in_list": True},
        ],
    }

    monkeypatch.setattr(
        ai_category_service,
        "_create_genai_client",
        lambda _api_key: _FakeGenaiClient(fake_payload, calls),
    )

    res = client.post(
        "/api/categories/ai/generate",
        data={"prompt": "I want a category for my kitchen spices", "create": "true"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["created"] is True
    assert body["category"]["name"] == "Kitchen Spices"
    assert body["category"]["icon"] == "category"
    assert body["category"]["color"] == "#1976d2"
    assert body["category"]["track_expiry"] is True
    assert body["category"]["expiry_label"] == "Best before"

    fields = body["category"]["fields"]
    labels = [f["label"] for f in fields]
    # Redundant built-ins & duplicate "brand" stripped
    assert labels == ["Brand", "Heat Level", "Origin", "Net Weight", "Container", "Organic"]
    # Unit stripped on non-number, kept on number
    assert fields[0]["unit"] is None
    assert fields[3]["unit"] == "g"
    # Dropdown options deduplicated; empty-options dropdown degraded to text
    assert fields[1]["type"] == "dropdown"
    assert fields[1]["options"] == ["Mild", "Medium", "Hot"]
    assert fields[2]["type"] == "text"
    # Max 4 show_in_list invariant respected
    assert sum(1 for f in fields if f["show_in_list"]) == 4

    # Verify Gemini Interactions API invocation uses current model and store=False
    assert len(calls) == 1
    assert calls[0]["model"] == "gemini-3.8-flash"
    assert calls[0]["store"] is False
    assert calls[0]["response_format"]["mime_type"] == "application/json"

    # Activity event recorded
    act = db_session.query(Activity).filter(Activity.entity_type == "category", Activity.entity_id == body["category"]["id"]).first()
    assert act is not None

    # Second run with same generated name disambiguates cleanly instead of IntegrityError
    res2 = client.post(
        "/api/categories/ai/generate",
        data={"prompt": "Another spice shelf", "create": "true"},
    )
    assert res2.status_code == 200
    assert res2.json()["category"]["name"] == "Kitchen Spices (2)"


def test_ai_generate_from_voice_audio_and_preview_commit(client, db_session, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-env-key")
    calls = []
    fake_payload = {
        "name": "Camera Gear",
        "icon": "cameraalt",
        "color": "#02435C",
        "track_expiry": False,
        "expiry_label": "",
        "optimization_summary": "Tailored photography gear schema from voice message.",
        "fields": [
            {"label": "Mount Type", "type": "dropdown", "options": ["Sony E", "Canon RF", "Nikon Z"], "show_in_list": True},
            {"label": "Focal Length", "type": "number", "unit": "mm", "show_in_list": True},
            {"label": "Serial Number", "type": "text", "required": True, "show_in_list": False},
        ],
    }

    monkeypatch.setattr(
        ai_category_service,
        "_create_genai_client",
        lambda _api_key: _FakeGenaiClient(fake_payload, calls),
    )

    sample_bytes = b"RIFF-fake-m4a-voice-note"
    gen_res = client.post(
        "/api/categories/ai/generate",
        data={"create": "false"},
        files={"audio": ("voice_note.m4a", sample_bytes, "audio/mp4; codecs=mp4a.40.2")},
    )
    assert gen_res.status_code == 200
    gen_body = gen_res.json()
    assert gen_body["created"] is False
    assert gen_body["category"] is None
    assert gen_body["plan"]["name"] == "Camera Gear"
    assert gen_body["plan"]["icon"] == "cameraalt"

    # Preview did not persist anything yet
    assert db_session.query(Category).filter(Category.name == "Camera Gear").count() == 0

    # Audio content block normalized cleanly for Gemini Interactions API
    sent_input = calls[0]["input"]
    audio_blocks = [b for b in sent_input if b.get("type") == "audio"]
    assert len(audio_blocks) == 1
    assert audio_blocks[0]["mime_type"] == "audio/m4a"
    assert base64.b64decode(audio_blocks[0]["data"]) == sample_bytes

    # Commit preview with a user edit (rename + keep first 2 fields)
    commit_res = client.post(
        "/api/categories/ai/commit",
        json={
            "name": "Pro Camera Lenses",
            "icon": gen_body["plan"]["icon"],
            "color": gen_body["plan"]["color"],
            "track_expiry": False,
            "expiry_label": None,
            "fields": gen_body["plan"]["fields"][:2],
        },
    )
    assert commit_res.status_code == 200
    committed = commit_res.json()
    assert committed["name"] == "Pro Camera Lenses"
    assert len(committed["fields"]) == 2
    assert db_session.query(FieldDef).filter(FieldDef.category_id == committed["id"]).count() == 2


def test_ai_provider_errors_do_not_leak_secrets(client, monkeypatch):
    secret = "AIzaSySuperSecretKey12345"
    monkeypatch.setenv("GEMINI_API_KEY", secret)

    class _FailingInteractions:
        def create(self, **kwargs):
            raise RuntimeError(f"upstream failed with key {secret}")

    class _FailingClient:
        interactions = _FailingInteractions()

    monkeypatch.setattr(ai_category_service, "_create_genai_client", lambda _key: _FailingClient())

    res = client.post("/api/categories/ai/generate", data={"prompt": "Audio gear"})
    assert res.status_code == 502
    body = res.json()
    assert body["error"]["code"] == "AI_PROVIDER_ERROR"
    assert secret not in json.dumps(body)


def test_ai_commit_preserves_custom_material_icon(client):
    res = client.post(
        "/api/categories/ai/commit",
        json={
            "name": "Coffee Equipment",
            "icon": "EspressoMaker_Two",
            "color": "#1976d2",
            "track_expiry": False,
            "expiry_label": None,
            "fields": [],
        },
    )
    assert res.status_code == 200
    assert res.json()["icon"] == "espressomakertwo"

    invalid_res = client.post(
        "/api/categories/ai/commit",
        json={
            "name": "Unsafe Icon Fallback",
            "icon": "<script>alert(1)</script>",
            "color": "#1976d2",
            "track_expiry": False,
            "expiry_label": None,
            "fields": [],
        },
    )
    assert invalid_res.status_code == 200
    assert invalid_res.json()["icon"] == "category"
