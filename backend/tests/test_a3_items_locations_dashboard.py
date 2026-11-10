import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_items_and_locations_flow(client):
    # 1. Create category with track_expiry
    res = client.post("/api/categories", json={
        "name": "Pantry Test",
        "icon": "kitchen",
        "color": "#4caf50",
        "track_expiry": True
    })
    assert res.status_code == 200
    cat_id = res.json()["id"]

    # Add custom field
    res = client.post(f"/api/categories/{cat_id}/fields", json={
        "label": "Brand",
        "type": "text",
        "required": False
    })
    assert res.status_code == 200
    brand_key = res.json()["key"]

    # 2. Create location tree
    res = client.post("/api/locations", json={"name": "Kitchen", "kind": "Room"})
    assert res.status_code == 200
    kitchen_id = res.json()["id"]

    res = client.post("/api/locations", json={"name": "Pantry Shelf 1", "kind": "Shelf", "parent_id": kitchen_id})
    assert res.status_code == 200
    shelf_id = res.json()["id"]

    # 3. Create items
    exp_soon = (date.today() + timedelta(days=5)).isoformat()
    res = client.post("/api/items", json={
        "name": "Oat Milk",
        "category_id": cat_id,
        "location_id": shelf_id,
        "expiry_date": exp_soon,
        "values": {brand_key: "Oatly"}
    })
    assert res.status_code == 200
    item = res.json()
    item_id = item["id"]
    assert item["expiry_status"] == "soon"
    assert item["values"][brand_key] == "Oatly"

    # 4. Check location items with sub-locations
    res = client.get(f"/api/locations/{kitchen_id}/items?include_sub=true")
    assert res.status_code == 200
    loc_items = res.json()
    assert any(it["id"] == item_id for it in loc_items)

    # 5. Taken out toggle
    res = client.post(f"/api/items/{item_id}/taken", json={"taken_out": True, "taken_by": "Alex"})
    assert res.status_code == 200
    assert res.json()["taken_out"] is True
    assert res.json()["taken_by"] == "Alex"

    # 6. Dashboard
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    dash = res.json()
    assert dash["total_items"] >= 1
    assert dash["taken_out_count"] >= 1
    assert dash["expiring_soon_count"] >= 1

    # 7. Soft delete and undo restore
    res = client.delete(f"/api/items/{item_id}")
    assert res.status_code == 200

    # Item should not be in list
    res = client.get("/api/items")
    assert all(it["id"] != item_id for it in res.json()["items"])

    # Undo restore
    res = client.post(f"/api/items/{item_id}/restore")
    assert res.status_code == 200
    assert res.json()["id"] == item_id

    # 8. Deleting category or location with active items must fail with 409
    res = client.delete(f"/api/categories/{cat_id}")
    assert res.status_code == 409
    assert "CATEGORY_HAS_ITEMS" in res.text

    res = client.delete(f"/api/locations/{shelf_id}")
    assert res.status_code == 409
    assert "LOCATION_HAS_ITEMS" in res.text
