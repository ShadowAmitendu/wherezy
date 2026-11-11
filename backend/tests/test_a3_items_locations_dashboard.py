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


def test_room_grouping_and_storage_only_places(client):
    cat = client.post("/api/categories", json={
        "name": "Room Test Cat",
        "icon": "inventory2",
        "color": "#1976d2",
        "track_expiry": False,
    }).json()

    # 1. Create a Room with multiple starter shelves/storage areas atomically
    res = client.post("/api/locations", json={
        "name": "Garage",
        "kind": "Garage",
        "children": [
            {"name": "Heavy Wall Shelf", "kind": "Shelf"},
            {"name": "Camping Storage Area", "kind": "Storage Area"},
        ],
    })
    assert res.status_code == 200
    garage = res.json()
    assert garage["is_room"] is True
    assert garage["storage_only"] is False

    garage_detail = client.get(f"/api/locations/{garage['id']}").json()
    assert garage_detail["children_count"] == 2
    shelf_id = next(c["id"] for c in garage_detail["children"] if c["name"] == "Heavy Wall Shelf")
    area_id = next(c["id"] for c in garage_detail["children"] if c["name"] == "Camping Storage Area")

    # 2. Batch add an additional shelf inside Garage
    batch = client.post(f"/api/locations/{garage['id']}/children", json={
        "children": [{"name": "Tool Workbench Drawer", "kind": "Drawer"}]
    })
    assert batch.status_code == 200
    assert len(batch.json()) == 1

    # 3. Create a separate standalone Storage-Only Room
    res_store = client.post("/api/locations", json={
        "name": "Store Room",
        "kind": "Storage Room",
        "storage_only": True,
    })
    assert res_store.status_code == 200
    store_room = res_store.json()
    assert store_room["is_room"] is True
    assert store_room["storage_only"] is True
    assert store_room["room_id"] == store_room["id"]
    assert store_room["room_name"] == "Store Room"

    # 4. Higher-grouping guardrail: Room cannot be nested inside Shelf or Storage Area
    bad_room = client.post("/api/locations", json={
        "name": "Nested Room",
        "kind": "Room",
        "parent_id": shelf_id,
    })
    assert bad_room.status_code == 400
    assert "INVALID_HIERARCHY" in bad_room.text

    bad_move = client.post(f"/api/locations/{store_room['id']}/move", json={"parent_id": area_id})
    assert bad_move.status_code == 400
    assert "INVALID_HIERARCHY" in bad_move.text

    # Switching a Room with children into storage_only fails cleanly
    bad_toggle = client.put(f"/api/locations/{garage['id']}", json={"storage_only": True})
    assert bad_toggle.status_code == 400
    assert "HAS_SUBLOCATIONS" in bad_toggle.text

    # 5. Store items both on shelves/storage areas inside Garage AND directly inside Store Room
    i1 = client.post("/api/items", json={"name": "Circular Saw", "category_id": cat["id"], "location_id": shelf_id}).json()
    i2 = client.post("/api/items", json={"name": "2-Person Tent", "category_id": cat["id"], "location_id": area_id}).json()
    i3 = client.post("/api/items", json={"name": "Spare Mattress", "category_id": cat["id"], "location_id": store_room["id"]}).json()
    assert i1["room_id"] == garage["id"] and i1["room_name"] == "Garage"
    assert i2["room_id"] == garage["id"] and i2["location_kind"] == "Storage Area"
    assert i3["room_id"] == store_room["id"] and i3["room_name"] == "Store Room"

    # 6. Tree and Dashboard roll up total items under each Room
    tree = client.get("/api/locations/tree").json()
    garage_tree = next(n for n in tree if n["id"] == garage["id"])
    assert garage_tree["children_count"] == 3
    assert garage_tree["items_count"] == 0
    assert garage_tree["total_items_count"] == 2

    store_tree = next(n for n in tree if n["id"] == store_room["id"])
    assert store_tree["storage_only"] is True
    assert store_tree["total_items_count"] == 1

    dash = client.get("/api/dashboard").json()
    room_map = {r["id"]: r for r in dash["room_counts"]}
    assert room_map[garage["id"]]["items_count"] == 2
    assert room_map[garage["id"]]["sub_locations_count"] == 3
    assert room_map[garage["id"]]["storage_only"] is False
    assert room_map[store_room["id"]]["items_count"] == 1
    assert room_map[store_room["id"]]["storage_only"] is True

    # 7. Adding a shelf inside Store Room automatically transitions it out of storage-only mode
    added = client.post(f"/api/locations/{store_room['id']}/children", json={
        "children": [{"name": "North Shelf", "kind": "Shelf"}]
    })
    assert added.status_code == 200
    refreshed_store = client.get(f"/api/locations/{store_room['id']}").json()
    assert refreshed_store["storage_only"] is False
    assert refreshed_store["children_count"] == 1
