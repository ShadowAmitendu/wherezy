import io
from backend.app.models import Category, Location, Item, Photo
from backend.app.core.security import create_session_token

def test_attachments_audit_and_trash(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    cat = Category(name="AuditCat", icon="cat", color="#123")
    loc = Location(name="Library", kind="Room")
    db_session.add_all([cat, loc])
    db_session.commit()

    it1 = Item(name="Manual Item", category_id=cat.id, location_id=loc.id, status="active")
    it2 = Item(name="Missing Book", category_id=cat.id, location_id=loc.id, status="active")
    db_session.add_all([it1, it2])
    db_session.commit()

    # 1. Attachment upload
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake pdf content")
    res = client.post(
        f"/api/items/{it1.id}/attachments",
        files={"file": ("manual.pdf", fake_pdf, "application/pdf")},
        cookies=auth_cookies
    )
    assert res.status_code == 200
    att = res.json()
    assert att["file_name"] == "manual.pdf"
    assert att["mime"] == "application/pdf"

    # Get file (inline preview)
    res = client.get(f"/api/attachments/{att['id']}/file", cookies=auth_cookies)
    assert res.status_code == 200
    assert res.headers["content-disposition"].startswith("inline")

    # 2. Shelf Audit
    res = client.post("/api/audits", json={"location_id": loc.id, "include_sub": True}, cookies=auth_cookies)
    assert res.status_code == 200
    audit = res.json()
    assert audit["expected_count"] == 2

    # Tick only it1 found
    res = client.put(f"/api/audits/{audit['id']}/found", json={"found_item_ids": [it1.id]}, cookies=auth_cookies)
    assert res.status_code == 200

    # Finish audit
    res = client.post(f"/api/audits/{audit['id']}/finish", cookies=auth_cookies)
    assert res.status_code == 200
    fin_audit = res.json()
    summ = fin_audit["summary"]
    assert summ["found_count"] == 1
    assert summ["missing_count"] == 1
    assert summ["missing_items"][0]["id"] == it2.id

    # 3. Trash and Restore
    res = client.delete(f"/api/items/{it2.id}", cookies=auth_cookies)
    assert res.status_code == 200

    # Listed in trash
    res = client.get("/api/trash", cookies=auth_cookies)
    assert res.status_code == 200
    trash_items = res.json()
    assert any(t["id"] == it2.id for t in trash_items)

    # Restore from trash
    res = client.post(f"/api/trash/item/{it2.id}/restore", json={}, cookies=auth_cookies)
    assert res.status_code == 200

    # Verify active
    db_session.expire_all()
    assert db_session.query(Item).filter(Item.id == it2.id).first().deleted_at is None


def test_empty_trash_handles_items_parent_child_locations_and_retired_items(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    cat = Category(name="PurgeCat", icon="Category", color="#123456")
    db_session.add(cat)
    db_session.commit()

    parent_loc = Location(name="Garage", kind="Room")
    db_session.add(parent_loc)
    db_session.commit()

    child_loc = Location(name="Shelf 1", kind="Shelf", parent_id=parent_loc.id)
    db_session.add(child_loc)
    db_session.commit()

    trashed_item = Item(name="Old Drill", category_id=cat.id, location_id=child_loc.id, status="active")
    retired_item = Item(name="Retired Saw", category_id=cat.id, location_id=parent_loc.id, status="retired")
    db_session.add_all([trashed_item, retired_item])
    db_session.commit()

    # Attach polymorphic photos to both item and location
    item_photo = Photo(owner_type="item", owner_id=trashed_item.id, file_name="item.jpg", thumb_name="item_t.jpg")
    loc_photo = Photo(owner_type="location", owner_id=parent_loc.id, file_name="loc.jpg", thumb_name="loc_t.jpg")
    db_session.add_all([item_photo, loc_photo])
    db_session.commit()

    # Soft-delete item, then child location, then parent location, then category
    assert client.delete(f"/api/items/{trashed_item.id}", cookies=auth_cookies).status_code == 200
    assert client.delete(f"/api/locations/{child_loc.id}", cookies=auth_cookies).status_code == 200
    assert client.delete(f"/api/locations/{parent_loc.id}", cookies=auth_cookies).status_code == 200

    # Retired item still blocks category deletion, so delete a second empty category instead
    empty_cat = Category(name="EmptyPurgeCat", icon="Category", color="#654321")
    db_session.add(empty_cat)
    db_session.commit()
    assert client.delete(f"/api/categories/{empty_cat.id}", cookies=auth_cookies).status_code == 200

    trashed_item_id = trashed_item.id
    retired_item_id = retired_item.id
    parent_loc_id = parent_loc.id
    child_loc_id = child_loc.id
    empty_cat_id = empty_cat.id
    item_photo_id = item_photo.id
    loc_photo_id = loc_photo.id

    # Emptying trash must flush item deletes, break location parent/item FK links, and purge photos without 500 FK error
    res = client.post("/api/trash/empty", cookies=auth_cookies)
    assert res.status_code == 200, res.text

    db_session.expire_all()
    assert db_session.query(Item).filter(Item.id == trashed_item_id).first() is None
    assert db_session.query(Location).filter(Location.id.in_([parent_loc_id, child_loc_id])).count() == 0
    assert db_session.query(Category).filter(Category.id == empty_cat_id).first() is None
    assert db_session.query(Photo).filter(Photo.id.in_([item_photo_id, loc_photo_id])).count() == 0

    # Retired item remains intact with its purged location detached
    kept = db_session.query(Item).filter(Item.id == retired_item_id).first()
    assert kept is not None
    assert kept.location_id is None


def test_purge_and_restore_trash_edge_cases(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    cat = Category(name="RestoreCat", icon="Category", color="#112233")
    room = Location(name="Attic", kind="Room")
    db_session.add_all([cat, room])
    db_session.commit()

    box = Location(name="Box A", kind="Box", parent_id=room.id)
    db_session.add(box)
    db_session.commit()

    item = Item(name="Lamp", category_id=cat.id, location_id=room.id, status="active")
    db_session.add(item)
    db_session.commit()

    # Delete item -> delete category -> delete child box -> delete parent room
    assert client.delete(f"/api/items/{item.id}", cookies=auth_cookies).status_code == 200
    assert client.delete(f"/api/categories/{cat.id}", cookies=auth_cookies).status_code == 200
    assert client.delete(f"/api/locations/{box.id}", cookies=auth_cookies).status_code == 200
    assert client.delete(f"/api/locations/{room.id}", cookies=auth_cookies).status_code == 200

    # Purging category individually while trashed item references it returns clean 409 instead of 500
    cat_purge_res = client.delete(f"/api/trash/category/{cat.id}", cookies=auth_cookies)
    assert cat_purge_res.status_code == 409
    assert cat_purge_res.json()["error"]["code"] == "CATEGORY_IN_USE"

    # Restoring item while its category is in trash returns clean 400 CATEGORY_DELETED
    item_restore_res = client.post(f"/api/trash/item/{item.id}/restore", json={}, cookies=auth_cookies)
    assert item_restore_res.status_code == 400
    assert item_restore_res.json()["error"]["code"] == "CATEGORY_DELETED"

    # Restoring child location while parent room stays in trash promotes child cleanly to root
    box_restore_res = client.post(f"/api/trash/location/{box.id}/restore", json={}, cookies=auth_cookies)
    assert box_restore_res.status_code == 200
    db_session.expire_all()
    restored_box = db_session.query(Location).filter(Location.id == box.id).first()
    assert restored_box.deleted_at is None
    assert restored_box.parent_id is None

    # Purging individual trashed parent location succeeds even with trashed item referencing it
    room_purge_res = client.delete(f"/api/trash/location/{room.id}", cookies=auth_cookies)
    assert room_purge_res.status_code == 200, room_purge_res.text
