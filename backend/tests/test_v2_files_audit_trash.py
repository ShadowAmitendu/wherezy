import io
from backend.app.models import Category, Location, Item
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
    assert res.headers["content-disposition"] == "inline"

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
