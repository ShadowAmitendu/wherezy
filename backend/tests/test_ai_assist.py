"""Tests for AI workflows across items, inbox sorting, bulk extraction, and location hierarchy setup."""

import io
import json
from types import SimpleNamespace

from PIL import Image

from backend.app.core.security import create_session_token
from backend.app.models import Category, FieldDef, Item, Location, Profile
from backend.app.services import ai_inventory_service


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


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), color=(20, 120, 220)).save(buf, format="PNG")
    return buf.getvalue()


def test_ai_assist_permissions(anon_client, db_session):
    assert anon_client.post("/api/ai/item/extract", data={"prompt": "AA battery"}).status_code == 401
    assert anon_client.post("/api/ai/items/bulk-extract", data={"prompt": "2 batteries"}).status_code == 401
    assert anon_client.post("/api/ai/locations/generate", data={"prompt": "Kitchen"}).status_code == 401

    viewer = Profile(name="AiView", username="aiview2", role="viewer", is_active=1)
    member = Profile(name="AiMem", username="aimem2", role="member", is_active=1)
    db_session.add_all([viewer, member])
    db_session.commit()

    viewer_client = type(anon_client)(anon_client.app)
    viewer_client.cookies.set("hi_session", create_session_token({"profile_id": viewer.id, "role": viewer.role}))
    assert viewer_client.post("/api/ai/item/extract", data={"prompt": "Drill"}).status_code == 403
    assert viewer_client.post("/api/ai/inbox/1/analyze").status_code == 403
    assert viewer_client.post("/api/ai/items/bulk-extract", data={"prompt": "Drill"}).status_code == 403
    assert viewer_client.post("/api/ai/locations/generate", data={"prompt": "Room"}).status_code == 403

    # Members can generate item/bulk suggestions, but cannot create location architecture (locations:write)
    member_client = type(anon_client)(anon_client.app)
    member_client.cookies.set("hi_session", create_session_token({"profile_id": member.id, "role": member.role}))
    assert member_client.post("/api/ai/locations/generate", data={"prompt": "Room"}).status_code == 403


def test_ai_item_extract_coerces_custom_fields_and_ids(client, db_session, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    cat = Category(name="Medicines", icon="medication", color="#2e7d32", track_expiry=1, expiry_label="Expiry date")
    db_session.add(cat)
    db_session.flush()
    f_form = FieldDef(
        category_id=cat.id,
        key="f_form0001",
        label="Form",
        type="dropdown",
        options_json=json.dumps(["Tablet", "Syrup", "Capsule"]),
        sort_order=1,
    )
    f_dose = FieldDef(
        category_id=cat.id,
        key="f_dose0002",
        label="Strength",
        type="number",
        unit="mg",
        sort_order=2,
    )
    f_rx = FieldDef(
        category_id=cat.id,
        key="f_rx000003",
        label="Prescription",
        type="checkbox",
        sort_order=3,
    )
    f_use = FieldDef(
        category_id=cat.id,
        key="f_use00004",
        label="Uses",
        type="multiselect",
        options_json=json.dumps(["Fever", "Pain", "Allergy"]),
        sort_order=4,
    )
    loc = Location(name="Medicine Cabinet", kind="Cupboard")
    db_session.add_all([f_form, f_dose, f_rx, f_use, loc])
    db_session.commit()

    calls = []
    fake_payload = {
        "name": "  Paracetamol   500mg  ",
        "category_id": cat.id,
        "location_id": loc.id,
        "quantity": 3,
        "expiry_date": "2028-09-15",
        "notes": "Strip of 15 tablets",
        "field_values": [
            {"key": "f_form0001", "value_text": "tablet"},  # case-insensitive dropdown canonicalization
            {"key": "f_dose0002", "value_text": "500 mg"},  # numeric extraction
            {"key": "f_rx000003", "value_text": "false"},
            {"key": "f_use00004", "value_text": "fever, PAIN, invalid_choice"},
        ],
        "summary": "Extracted Paracetamol 500mg (qty 3) for Medicine Cabinet.",
    }
    monkeypatch.setattr(
        ai_inventory_service,
        "_create_genai_client",
        lambda _k: _FakeGenaiClient(fake_payload, calls),
    )

    res = client.post(
        "/api/ai/item/extract",
        data={"prompt": "3 strips paracetamol 500mg expires 2028-09-15 in cabinet"},
        files={"image": ("med.png", _png_bytes(), "image/png")},
    )
    assert res.status_code == 200
    s = res.json()["suggestion"]
    assert s["name"] == "Paracetamol 500mg"
    assert s["category_id"] == cat.id
    assert s["location_id"] == loc.id
    assert s["quantity"] == 3
    assert s["expiry_date"] == "2028-09-15"
    assert s["values"]["f_form0001"] == "Tablet"
    assert s["values"]["f_dose0002"] == 500
    assert s["values"]["f_rx000003"] is False
    assert s["values"]["f_use00004"] == ["Fever", "Pain"]
    # Image block + text block must be sent to Gemini Interactions API
    sent_types = [block["type"] for block in calls[0]["input"]]
    assert "text" in sent_types and "image" in sent_types


def test_ai_inbox_analyze_reads_saved_photo(client, db_session, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    cat = Category(name="Tools", icon="build", color="#ed6c02", track_expiry=0)
    loc = Location(name="Garage", kind="Room")
    db_session.add_all([cat, loc])
    db_session.commit()

    cap = client.post(
        "/api/inbox",
        files=[("photos", ("drill.png", _png_bytes(), "image/png"))],
        data={"location_id": str(loc.id)},
    )
    assert cap.status_code == 200
    inbox_id = cap.json()["id"]

    calls = []
    fake_payload = {
        "name": "Cordless Drill 12V",
        "category_id": cat.id,
        "location_id": loc.id,
        "quantity": 1,
        "expiry_date": "",
        "notes": "Includes lithium battery pack",
        "field_values": [],
        "summary": "Identified cordless drill from inbox photo.",
    }
    monkeypatch.setattr(
        ai_inventory_service,
        "_create_genai_client",
        lambda _k: _FakeGenaiClient(fake_payload, calls),
    )

    res = client.post(f"/api/ai/inbox/{inbox_id}/analyze")
    assert res.status_code == 200
    s = res.json()["suggestion"]
    assert s["name"] == "Cordless Drill 12V"
    assert s["category_id"] == cat.id
    assert s["location_id"] == loc.id
    assert any(b["type"] == "image" for b in calls[0]["input"])


def test_ai_bulk_extract_and_mixed_category_commit(client, db_session, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    c1 = Category(name="Electronics", icon="devices", color="#1976d2", track_expiry=0)
    c2 = Category(name="Pantry", icon="kitchen", color="#2e7d32", track_expiry=1, expiry_label="Best before")
    loc = Location(name="Kitchen Shelf", kind="Shelf")
    db_session.add_all([c1, c2, loc])
    db_session.commit()

    calls = []
    fake_payload = {
        "summary": "Extracted 2 items across Electronics and Pantry.",
        "items": [
            {
                "name": "AA Batteries Pack",
                "category_id": c1.id,
                "location_id": loc.id,
                "quantity": 4,
                "expiry_date": "2029-01-01",
                "notes": "Alkaline",
                "field_values": [],
            },
            {
                "name": "Olive Oil Bottle",
                "category_id": c2.id,
                "location_id": loc.id,
                "quantity": 2,
                "expiry_date": "2027-06-01",
                "notes": "Extra virgin",
                "field_values": [],
            },
        ],
    }
    monkeypatch.setattr(
        ai_inventory_service,
        "_create_genai_client",
        lambda _k: _FakeGenaiClient(fake_payload, calls),
    )

    ext = client.post(
        "/api/ai/items/bulk-extract",
        data={"prompt": "4 AA battery packs and 2 bottles olive oil best before 2027-06-01"},
    )
    assert ext.status_code == 200
    items = ext.json()["items"]
    assert len(items) == 2

    commit = client.post(
        "/api/ai/items/bulk-commit",
        json={"items": items},
    )
    assert commit.status_code == 200
    cdata = commit.json()
    assert cdata["created_count"] == 2
    assert cdata["items"][0]["quantity"] == 4
    assert cdata["items"][0]["expiry_date"] is None  # c1 has track_expiry=0
    assert cdata["items"][1]["expiry_date"] == "2027-06-01"  # c2 has track_expiry=1
    assert db_session.query(Item).filter(Item.deleted_at.is_(None)).count() == 2


def test_ai_location_hierarchy_generate_and_commit_handles_order_and_cycles(client, db_session, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    calls = []
    # Child appears before parent + invalid kind normalized cleanly
    fake_payload = {
        "summary": "Organized kitchen cupboard and shelves.",
        "nodes": [
            {"temp_id": "s1", "parent_temp_id": "pantry", "name": "Top Shelf", "kind": "shelf", "notes": "Spices"},
            {"temp_id": "pantry", "parent_temp_id": "kitchen", "name": "Pantry Cupboard", "kind": "cupboard", "notes": ""},
            {"temp_id": "kitchen", "parent_temp_id": "", "name": "Kitchen", "kind": "room", "notes": ""},
            {"temp_id": "bad", "parent_temp_id": "missing_id", "name": "Garage Bin", "kind": "UNKNOWN_KIND", "notes": ""},
        ],
    }
    monkeypatch.setattr(
        ai_inventory_service,
        "_create_genai_client",
        lambda _k: _FakeGenaiClient(fake_payload, calls),
    )

    gen = client.post(
        "/api/ai/locations/generate",
        data={"prompt": "Kitchen with pantry cupboard and top shelf, plus garage bin", "create": "false"},
    )
    assert gen.status_code == 200
    plan = gen.json()["plan"]
    names_in_order = [n["name"] for n in plan["nodes"]]
    # Parent must precede child in sanitized order
    assert names_in_order.index("Kitchen") < names_in_order.index("Pantry Cupboard")
    assert names_in_order.index("Pantry Cupboard") < names_in_order.index("Top Shelf")
    bin_node = next(n for n in plan["nodes"] if n["name"] == "Garage Bin")
    assert bin_node["parent_temp_id"] is None
    assert bin_node["kind"] == "Room"

    com = client.post(
        "/api/ai/locations/commit",
        json={"root_parent_id": None, "nodes": plan["nodes"]},
    )
    assert com.status_code == 200
    assert com.json()["created_count"] == 4
    top_shelf = db_session.query(Location).filter(Location.name == "Top Shelf").first()
    assert top_shelf is not None and top_shelf.parent.name == "Pantry Cupboard"


def test_ai_location_hierarchy_promotes_rooms_and_preserves_storage_only(client, db_session, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls = []
    fake_payload = {
        "summary": "Separate store room plus garage with storage area.",
        "nodes": [
            {"temp_id": "g1", "parent_temp_id": "", "name": "Garage", "kind": "Garage", "storage_only": False, "notes": ""},
            {"temp_id": "sa1", "parent_temp_id": "g1", "name": "Left Storage Area", "kind": "Storage Area", "storage_only": False, "notes": ""},
            {"temp_id": "bad_room", "parent_temp_id": "sa1", "name": "Attic Room", "kind": "Room", "storage_only": True, "notes": ""},
        ],
    }
    monkeypatch.setattr(
        ai_inventory_service,
        "_create_genai_client",
        lambda _k: _FakeGenaiClient(fake_payload, calls),
    )

    gen = client.post(
        "/api/ai/locations/generate",
        data={"prompt": "Garage with storage area, plus separate storage-only attic room", "create": "true"},
    )
    assert gen.status_code == 200
    data = gen.json()
    assert data["created"] is True
    by_name = {loc["name"]: loc for loc in data["created_locations"]}
    assert by_name["Garage"]["is_room"] is True
    assert by_name["Left Storage Area"]["kind"] == "Storage Area"
    assert by_name["Left Storage Area"]["parent_id"] == by_name["Garage"]["id"]
    # AI mistakenly tried nesting Room under Storage Area -> promoted to top level & storage_only preserved
    assert by_name["Attic Room"]["parent_id"] is None
    assert by_name["Attic Room"]["storage_only"] is True
