import io
from datetime import date, timedelta
from PIL import Image
from backend.app.models import Category, Location, Item, ReminderState, HealthIgnore, Box, Move, BoxItem
from backend.app.core.security import create_session_token


def _admin_cookies():
    token = create_session_token({"profile_id": 1, "role": "admin"})
    return {"hi_session": token}


def test_bulk_move_and_bulk_create_undo_via_batch(client, db_session):
    cookies = _admin_cookies()
    cat = Category(name="UndoCat", icon="inventory", color="#1976d2")
    loc_a = Location(name="Shelf A", kind="Shelf")
    loc_b = Location(name="Shelf B", kind="Shelf")
    db_session.add_all([cat, loc_a, loc_b])
    db_session.commit()

    # 1. Bulk create -> undo soft-deletes created items
    res = client.post("/api/items/bulk-create", json={
        "category_id": cat.id,
        "location_id": loc_a.id,
        "items": [{"name": "Screwdriver"}, {"name": "Pliers"}],
    }, cookies=cookies)
    assert res.status_code == 200
    bulk_data = res.json()
    assert bulk_data["batch_id"]
    created_ids = [it["id"] for it in bulk_data["items"]]

    undo_res = client.post(f"/api/batches/{bulk_data['batch_id']}/undo", cookies=cookies)
    assert undo_res.status_code == 200
    assert undo_res.json()["reverted_count"] == 2

    for iid in created_ids:
        it = db_session.query(Item).filter(Item.id == iid).first()
        db_session.refresh(it)
        assert it.deleted_at is not None

    # Restore them for bulk-move undo test
    for iid in created_ids:
        assert client.post(f"/api/items/{iid}/restore", cookies=cookies).status_code == 200

    # 2. Bulk move returns batch_id and undo moves items back
    move_res = client.post("/api/items/bulk-move", json={
        "item_ids": created_ids,
        "location_id": loc_b.id,
    }, cookies=cookies)
    assert move_res.status_code == 200
    move_data = move_res.json()
    assert move_data["moved_count"] == 2
    assert move_data["batch_id"]

    undo_move = client.post(f"/api/batches/{move_data['batch_id']}/undo", cookies=cookies)
    assert undo_move.status_code == 200
    assert undo_move.json()["reverted_count"] == 2

    for iid in created_ids:
        it = db_session.query(Item).filter(Item.id == iid).first()
        db_session.refresh(it)
        assert it.location_id == loc_a.id


def test_reminder_restore_undoes_snooze_and_dismiss(client, db_session):
    cookies = _admin_cookies()
    cat = Category(name="RemUndoCat", track_expiry=1, expiry_lead_days=30)
    db_session.add(cat)
    db_session.commit()

    due = (date.today() + timedelta(days=2)).isoformat()
    it = Item(name="Milk", category_id=cat.id, expiry_date=due, status="active")
    db_session.add(it)
    db_session.commit()

    # Snooze then restore back to active (clears state row)
    res = client.post("/api/reminders/snooze", json={
        "source_type": "expiry",
        "item_id": it.id,
        "due_date": due,
        "snooze_days": 5,
    }, cookies=cookies)
    assert res.status_code == 200
    assert db_session.query(ReminderState).filter(ReminderState.item_id == it.id).count() == 1

    restore = client.post("/api/reminders/restore", json={
        "source_type": "expiry",
        "item_id": it.id,
        "due_date": due,
        "snoozed_until": None,
        "dismissed_at": None,
    }, cookies=cookies)
    assert restore.status_code == 200
    assert db_session.query(ReminderState).filter(ReminderState.item_id == it.id).count() == 0

    # Dismiss after snooze, then restore previous snoozed_until
    prev_snooze = (date.today() + timedelta(days=5)).isoformat()
    assert client.post("/api/reminders/snooze", json={
        "source_type": "expiry",
        "item_id": it.id,
        "due_date": due,
        "snoozed_until": prev_snooze,
    }, cookies=cookies).status_code == 200
    assert client.post("/api/reminders/dismiss", json={
        "source_type": "expiry",
        "item_id": it.id,
        "due_date": due,
    }, cookies=cookies).status_code == 200

    restore_snooze = client.post("/api/reminders/restore", json={
        "source_type": "expiry",
        "item_id": it.id,
        "due_date": due,
        "snoozed_until": prev_snooze,
        "dismissed_at": None,
    }, cookies=cookies)
    assert restore_snooze.status_code == 200
    rems = client.get("/api/reminders", cookies=cookies).json()
    rem = next(r for r in rems if r["item_id"] == it.id)
    assert rem["status"] == "snoozed"
    assert rem["snoozed_until"] == prev_snooze


def test_health_unignore_and_inbox_unsort(client, db_session):
    cookies = _admin_cookies()
    cat = Category(name="HealthInboxCat", icon="category", color="#1976d2")
    loc = Location(name="Drawer", kind="Drawer")
    db_session.add_all([cat, loc])
    db_session.commit()

    it = Item(name="Mystery Cord", category_id=cat.id, status="active")
    db_session.add(it)
    db_session.commit()

    # Health ignore + unignore
    assert client.post("/api/health/ignore", json={
        "check_key": "no_location",
        "item_id": it.id,
    }, cookies=cookies).status_code == 200
    assert db_session.query(HealthIgnore).filter(HealthIgnore.item_id == it.id).count() == 1

    unignore = client.post("/api/health/unignore", json={
        "check_key": "no_location",
        "item_id": it.id,
    }, cookies=cookies)
    assert unignore.status_code == 200
    assert db_session.query(HealthIgnore).filter(HealthIgnore.item_id == it.id).count() == 0

    # Inbox sort + unsort
    img = io.BytesIO()
    Image.new("RGB", (8, 8), color="blue").save(img, format="JPEG")
    img.seek(0)
    cap = client.post(
        "/api/inbox",
        data={"name": "Loose USB"},
        files={"photos": ("usb.jpg", img, "image/jpeg")},
        cookies=cookies,
    )
    assert cap.status_code == 200
    inbox_id = cap.json()["id"]

    sort_res = client.post(f"/api/inbox/{inbox_id}/sort", json={
        "name": "USB-C Cable",
        "category_id": cat.id,
        "location_id": loc.id,
        "quantity": 2,
        "values": {},
    }, cookies=cookies)
    assert sort_res.status_code == 200

    unsort_res = client.post(f"/api/inbox/{inbox_id}/unsort", json={
        "name": "Loose USB",
        "location_id": None,
        "quantity": 1,
        "values": {},
    }, cookies=cookies)
    assert unsort_res.status_code == 200
    inbox_list = client.get("/api/inbox", cookies=cookies).json()
    assert any(row["id"] == inbox_id and row["name"] == "Loose USB" for row in inbox_list)


def test_box_unpack_returns_metadata_and_undo_restores_box(client, db_session):
    cookies = _admin_cookies()
    cat = Category(name="BoxCat", icon="box", color="#1976d2")
    src = Location(name="Old Room", kind="Room")
    dst = Location(name="New Room", kind="Room")
    mv = Move(name="Spring Move", status="planning")
    db_session.add_all([cat, src, dst, mv])
    db_session.commit()

    it = Item(name="Lamp", category_id=cat.id, location_id=src.id, status="active")
    db_session.add(it)
    db_session.commit()

    box = Box(move_id=mv.id, number=1, label="Living Room #1", status="packed")
    db_session.add(box)
    db_session.commit()
    db_session.add(BoxItem(box_id=box.id, item_id=it.id, active=1))
    db_session.commit()

    unpack_res = client.post(f"/api/boxes/{box.id}/unpack", json={
        "item_ids": [it.id],
        "location_id": dst.id,
    }, cookies=cookies)
    assert unpack_res.status_code == 200
    unpack_data = unpack_res.json()
    assert unpack_data["batch_id"]
    assert unpack_data["previous_status"] == "packed"
    assert unpack_data["unpacked_item_ids"] == [it.id]

    db_session.refresh(it)
    db_session.refresh(box)
    assert it.location_id == dst.id
    assert box.status == "unpacked"

    undo_res = client.post(f"/api/boxes/{box.id}/unpack/undo", json={
        "batch_id": unpack_data["batch_id"],
        "item_ids": unpack_data["unpacked_item_ids"],
        "previous_status": unpack_data["previous_status"],
    }, cookies=cookies)
    assert undo_res.status_code == 200

    db_session.refresh(it)
    db_session.refresh(box)
    bi = db_session.query(BoxItem).filter(BoxItem.box_id == box.id, BoxItem.item_id == it.id).first()
    assert it.location_id == src.id
    assert box.status == "packed"
    assert bi.active == 1
