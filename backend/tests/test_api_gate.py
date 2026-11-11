import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.migrations import run_migrations

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    run_migrations()

client = TestClient(app)

def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "time" in data

def test_templates_and_categories(client):
    # List templates
    res = client.get("/api/templates")
    assert res.status_code == 200
    templates = res.json()
    assert len(templates) >= 4
    medicines = next(t for t in templates if t["slug"] == "medicines")
    assert medicines["track_expiry"] is True

    # Apply template
    res = client.post("/api/templates/medicines/apply")
    assert res.status_code == 200
    cat_data = res.json()
    assert "Medicines" in cat_data["name"]
    assert len(cat_data["fields"]) >= 5

def test_location_cycle_and_crud(client):
    # Create parent
    res = client.post("/api/locations", json={"name": "Garage", "kind": "Room"})
    assert res.status_code == 200
    garage = res.json()

    # Create child
    res = client.post("/api/locations", json={"name": "Workbench", "kind": "Cupboard", "parent_id": garage["id"]})
    assert res.status_code == 200
    bench = res.json()

    # Attempt cycle: moving garage into workbench should fail
    res = client.post(f"/api/locations/{garage['id']}/move", json={"parent_id": bench["id"]})
    assert res.status_code == 400
    assert "CYCLE_DETECTED" in res.text

def test_code_resolve(client):
    # Create location
    res = client.post("/api/locations", json={"name": "Attic", "kind": "Room"})
    assert res.status_code == 200
    loc_id = res.json()["id"]

    # Resolve L{loc_id}
    res = client.get(f"/api/codes/resolve?code=L{loc_id}")
    assert res.status_code == 200
    assert res.json()["type"] == "location"
    assert res.json()["id"] == loc_id

    import urllib.parse
    # Resolve via URL (properly URL-encoded query param)
    encoded_url = urllib.parse.quote_plus(f"http://localhost:8000/#/l/{loc_id}")
    res = client.get(f"/api/codes/resolve?code={encoded_url}")
    assert res.status_code == 200
    assert res.json()["type"] == "location"

    # Helper & zero-padded formatting from I01 upward
    from backend.app.services.item_service import format_item_code, parse_item_code
    assert format_item_code(1) == "I01"
    assert format_item_code(9) == "I09"
    assert format_item_code(10) == "I10"
    assert parse_item_code("I01") == 1
    assert parse_item_code("i01") == 1
    assert parse_item_code("I00") is None

    # Create category & item (resolves via zero-padded I01+ format and searches by code)
    cat_res = client.post("/api/categories", json={"name": "Code Tools"})
    assert cat_res.status_code == 200
    cat_id = cat_res.json()["id"]

    item_res = client.post("/api/items", json={"name": "Cordless Drill", "category_id": cat_id, "location_id": loc_id})
    assert item_res.status_code == 200
    item_id = item_res.json()["id"]
    padded_code = format_item_code(item_id)

    res = client.get(f"/api/codes/resolve?code={padded_code}")
    assert res.status_code == 200
    assert res.json()["type"] == "item"
    assert res.json()["id"] == item_id

    # I00 should be rejected cleanly as invalid (item codes start from I01)
    bad_res = client.get("/api/codes/resolve?code=I00")
    assert bad_res.status_code == 400

    # Non-existent single-digit item code error formats with zero padding (I01 / I02)
    missing_id = 1 if item_id != 1 else 2
    miss_res = client.get(f"/api/codes/resolve?code=I{missing_id}")
    assert miss_res.status_code == 404
    assert f"Item I0{missing_id} not found" in miss_res.text

    # Searching by padded item code works in both /api/items and /api/search/quick
    items_search = client.get(f"/api/items?q={padded_code}")
    assert items_search.status_code == 200
    assert any(it["id"] == item_id for it in items_search.json()["items"])

    quick_search = client.get(f"/api/search/quick?q={padded_code}")
    assert quick_search.status_code == 200
    item_hits = [r for r in quick_search.json()["results"] if r["type"] == "item" and r["id"] == item_id]
    assert len(item_hits) == 1
    assert item_hits[0]["subtitle"].startswith(padded_code)
