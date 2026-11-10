from backend.app.models import Category, Location, Item
from backend.app.core.security import create_session_token

def test_tags_and_bulk_operations(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    cat = Category(name="BulkCat", icon="cat", color="#123", track_expiry=1)
    loc1 = Location(name="Shelf 1", kind="Shelf")
    loc2 = Location(name="Shelf 2", kind="Shelf")
    db_session.add_all([cat, loc1, loc2])
    db_session.commit()

    it1 = Item(name="Item 1", category_id=cat.id, location_id=loc1.id, status="active")
    it2 = Item(name="Item 2", category_id=cat.id, location_id=loc1.id, status="active")
    it3 = Item(name="Item 3", category_id=cat.id, location_id=loc1.id, status="active")
    db_session.add_all([it1, it2, it3])
    db_session.commit()

    # 1. Tags create and merge
    res = client.post("/api/tags", json={"name": "Kitchen", "color": "#ff9800"}, cookies=auth_cookies)
    assert res.status_code == 200
    tag_kitchen = res.json()

    res = client.post("/api/tags", json={"name": "Cooking", "color": "#f44336"}, cookies=auth_cookies)
    assert res.status_code == 200
    tag_cooking = res.json()

    # Merge Kitchen into Cooking
    res = client.post(f"/api/tags/{tag_kitchen['id']}/merge", json={"target_tag_id": tag_cooking["id"]}, cookies=auth_cookies)
    assert res.status_code == 200

    # 2. Bulk preview (dry-run)
    res = client.post("/api/items/bulk/preview", json={
        "ids": [it1.id, it2.id, it3.id],
        "action": "move",
        "params": {"location_id": loc2.id}
    }, cookies=auth_cookies)
    assert res.status_code == 200
    preview = res.json()
    assert preview["dry_run"] is True
    assert preview["changed"] == 3

    # Items still on loc1
    assert db_session.query(Item).filter(Item.id == it1.id).first().location_id == loc1.id

    # 3. Bulk execute
    res = client.post("/api/items/bulk", json={
        "ids": [it1.id, it2.id, it3.id],
        "action": "move",
        "params": {"location_id": loc2.id}
    }, cookies=auth_cookies)
    assert res.status_code == 200
    result = res.json()
    assert result["changed"] == 3
    batch_id = result["batch_id"]
    assert batch_id is not None

    # Items moved to loc2
    db_session.expire_all()
    assert db_session.query(Item).filter(Item.id == it1.id).first().location_id == loc2.id

    # 4. Batch Undo
    res = client.post(f"/api/batches/{batch_id}/undo", cookies=auth_cookies)
    assert res.status_code == 200
    undo_res = res.json()
    assert undo_res["reverted_count"] == 3

    # Items restored to loc1
    db_session.expire_all()
    assert db_session.query(Item).filter(Item.id == it1.id).first().location_id == loc1.id
