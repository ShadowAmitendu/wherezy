import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_location_max_quantity_crud_and_capacity_metrics(client):
    # 1. Create location with max_quantity
    res = client.post("/api/locations", json={
        "name": "Limited Storage Cabinet",
        "kind": "Room",
        "max_quantity": 5
    })
    assert res.status_code == 200, res.text
    cabinet = res.json()
    cab_id = cabinet["id"]
    assert cabinet["max_quantity"] == 5
    assert cabinet["available_capacity"] == 5

    # 2. Check get location detail
    res = client.get(f"/api/locations/{cab_id}")
    assert res.status_code == 200
    detail = res.json()
    assert detail["max_quantity"] == 5
    assert detail["available_capacity"] == 5

    # 3. Create category
    res = client.post("/api/categories", json={
        "name": "Capacity Test Tools",
        "icon": "handyman",
        "color": "#ff9800"
    })
    assert res.status_code == 200
    cat_id = res.json()["id"]

    # 4. Add items up to capacity (3 units)
    res = client.post("/api/items", json={
        "name": "Screwdriver Set",
        "category_id": cat_id,
        "location_id": cab_id,
        "quantity": 3
    })
    assert res.status_code == 200
    item1_id = res.json()["id"]

    # Check updated available capacity
    res = client.get(f"/api/locations/{cab_id}")
    assert res.status_code == 200
    assert res.json()["available_capacity"] == 2

    # 5. Adding 3 units should fail (3 + 3 = 6 > 5)
    res = client.post("/api/items", json={
        "name": "Wrench Set",
        "category_id": cat_id,
        "location_id": cab_id,
        "quantity": 3
    })
    assert res.status_code == 400
    err = res.json()["error"]
    assert err["code"] == "LOCATION_CAPACITY_EXCEEDED"
    assert "maximum allowed quantity" in err["message"]

    # 6. Adding 2 units should succeed exactly (3 + 2 = 5)
    res = client.post("/api/items", json={
        "name": "Pliers",
        "category_id": cat_id,
        "location_id": cab_id,
        "quantity": 2
    })
    assert res.status_code == 200
    item2_id = res.json()["id"]

    # Available capacity should now be 0
    res = client.get(f"/api/locations/{cab_id}")
    assert res.status_code == 200
    assert res.json()["available_capacity"] == 0

    # 7. Adding 1 more unit now must fail
    res = client.post("/api/items", json={
        "name": "Hammer",
        "category_id": cat_id,
        "location_id": cab_id,
        "quantity": 1
    })
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"

    # 8. Updating item quantity exceeding capacity should fail
    # item2 is quantity 2. Updating it to 3 would need 6 units total.
    res = client.put(f"/api/items/{item2_id}", json={
        "quantity": 3
    })
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"

    # 9. Reducing item quantity should succeed and free up capacity
    res = client.put(f"/api/items/{item2_id}", json={
        "quantity": 1
    })
    assert res.status_code == 200
    assert res.json()["quantity"] == 1

    res = client.get(f"/api/locations/{cab_id}")
    assert res.status_code == 200
    assert res.json()["available_capacity"] == 1


def test_location_hierarchy_capacity_enforcement(client):
    # 1. Create a parent room with max_quantity = 4
    res = client.post("/api/locations", json={
        "name": "Small Attic Room",
        "kind": "Room",
        "max_quantity": 4
    })
    assert res.status_code == 200
    room_id = res.json()["id"]

    # 2. Create a child shelf with max_quantity = 3
    res = client.post("/api/locations", json={
        "name": "Attic Shelf A",
        "kind": "Shelf",
        "parent_id": room_id,
        "max_quantity": 3
    })
    assert res.status_code == 200
    shelf_id = res.json()["id"]

    # 3. Create category
    res = client.post("/api/categories", json={
        "name": "Books",
        "icon": "menu_book",
        "color": "#2196f3"
    })
    assert res.status_code == 200
    cat_id = res.json()["id"]

    # 4. Adding 4 items to shelf should fail because shelf max is 3
    res = client.post("/api/items", json={
        "name": "Book Bundle 1",
        "category_id": cat_id,
        "location_id": shelf_id,
        "quantity": 4
    })
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"

    # 5. Adding 3 items to shelf succeeds (shelf at 3/3, room at 3/4)
    res = client.post("/api/items", json={
        "name": "Book Bundle 2",
        "category_id": cat_id,
        "location_id": shelf_id,
        "quantity": 3
    })
    assert res.status_code == 200
    item_on_shelf = res.json()

    # 6. Try adding 2 items directly to room -> 3 + 2 = 5 > 4 (room max is 4) -> fails
    res = client.post("/api/items", json={
        "name": "Attic Floor Item",
        "category_id": cat_id,
        "location_id": room_id,
        "quantity": 2
    })
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"

    # 7. Adding 1 item directly to room succeeds (room at 4/4)
    res = client.post("/api/items", json={
        "name": "Attic Floor Item",
        "category_id": cat_id,
        "location_id": room_id,
        "quantity": 1
    })
    assert res.status_code == 200
    item_in_room = res.json()

    # Room is full (4/4). Try moving an external item into the shelf or room -> fails
    res = client.post("/api/locations", json={"name": "Outside Yard", "kind": "Room"})
    yard_id = res.json()["id"]
    res = client.post("/api/items", json={
        "name": "Yard Shovel",
        "category_id": cat_id,
        "location_id": yard_id,
        "quantity": 1
    })
    shovel_id = res.json()["id"]

    # Move shovel to room -> fails
    res = client.post(f"/api/items/{shovel_id}/move", json={"location_id": room_id})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"

    # Duplicate item inside room -> fails
    res = client.post(f"/api/items/{item_in_room['id']}/duplicate")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"


def test_location_update_max_quantity_below_current(client):
    # Location with 3 items cannot be updated to max_quantity = 2
    res = client.post("/api/locations", json={"name": "Wardrobe", "kind": "Room"})
    loc_id = res.json()["id"]

    res = client.post("/api/categories", json={"name": "Clothes", "icon": "checkroom", "color": "#9c27b0"})
    cat_id = res.json()["id"]

    res = client.post("/api/items", json={
        "name": "Coats",
        "category_id": cat_id,
        "location_id": loc_id,
        "quantity": 3
    })
    assert res.status_code == 200

    # Setting max_quantity = 2 should fail
    res = client.put(f"/api/locations/{loc_id}", json={"max_quantity": 2})
    assert res.status_code == 400
    err = res.json()["error"]
    assert err["code"] == "LOCATION_CAPACITY_EXCEEDED"
    assert "already contains 3 items/units" in err["message"]

    # Setting max_quantity = 3 or higher succeeds
    res = client.put(f"/api/locations/{loc_id}", json={"max_quantity": 3})
    assert res.status_code == 200
    assert res.json()["max_quantity"] == 3
    assert res.json()["available_capacity"] == 0

    # Removing max_quantity (None) succeeds
    res = client.put(f"/api/locations/{loc_id}", json={"max_quantity": None})
    assert res.status_code == 200
    assert res.json()["max_quantity"] is None
    assert res.json()["available_capacity"] is None


def test_bulk_operations_and_trash_restore_capacity(client):
    res = client.post("/api/locations", json={"name": "Small Locker", "kind": "Room", "max_quantity": 2})
    loc_id = res.json()["id"]

    res = client.post("/api/categories", json={"name": "Locker Items", "icon": "lock", "color": "#607d8b"})
    cat_id = res.json()["id"]

    # 1. Bulk create with total quantity 3 should fail (category_id at top level)
    res = client.post("/api/items/bulk-create", json={
        "category_id": cat_id,
        "location_id": loc_id,
        "items": [
            {"name": "Item A", "quantity": 1},
            {"name": "Item B", "quantity": 2},
        ]
    })
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"

    # 2. Add individual item 1 of quantity 1
    res = client.post("/api/items", json={
        "name": "Item 1",
        "category_id": cat_id,
        "location_id": loc_id,
        "quantity": 1
    })
    assert res.status_code == 200
    item1_id = res.json()["id"]

    # 3. Add individual item 2 of quantity 1
    res = client.post("/api/items", json={
        "name": "Item 2",
        "category_id": cat_id,
        "location_id": loc_id,
        "quantity": 1
    })
    assert res.status_code == 200
    item2_id = res.json()["id"]

    # 4. Delete item 1 (moves to trash) -> frees 1 capacity
    res = client.delete(f"/api/items/{item1_id}")
    assert res.status_code == 200

    res = client.get(f"/api/locations/{loc_id}")
    assert res.json()["available_capacity"] == 1

    # 5. Add another item of quantity 1 to fill locker again
    res = client.post("/api/items", json={
        "name": "Item 3",
        "category_id": cat_id,
        "location_id": loc_id,
        "quantity": 1
    })
    assert res.status_code == 200

    # 6. Restore deleted item 1 from trash should fail because locker is now full
    res = client.post(f"/api/trash/item/{item1_id}/restore")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"

    # 7. Test bulk move into full location
    res = client.post("/api/locations", json={"name": "Overflow Area", "kind": "Room"})
    overflow_id = res.json()["id"]
    res = client.post("/api/items", json={
        "name": "Movable Item",
        "category_id": cat_id,
        "location_id": overflow_id,
        "quantity": 1
    })
    movable_id = res.json()["id"]

    res = client.post("/api/items/bulk", json={
        "action": "move",
        "ids": [movable_id],
        "params": {"location_id": loc_id}
    })
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "LOCATION_CAPACITY_EXCEEDED"
