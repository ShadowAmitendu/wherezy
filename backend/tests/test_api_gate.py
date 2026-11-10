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

def test_templates_and_categories():
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

def test_location_cycle_and_crud():
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

def test_code_resolve():
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
