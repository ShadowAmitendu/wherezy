import io
import openpyxl
from backend.app.models import Category, Location, Item
from backend.app.core.security import create_session_token

def test_moves_labels_and_excel_export(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    cat = Category(name="Tools", icon="build", color="#607d8b")
    loc1 = Location(name="Garage", kind="Room")
    loc2 = Location(name="New Workshop", kind="Room")
    db_session.add_all([cat, loc1, loc2])
    db_session.commit()

    it = Item(name="Hammer", category_id=cat.id, location_id=loc1.id, status="active")
    db_session.add(it)
    db_session.commit()

    # 1. Moving House: Move & Boxes
    res = client.post("/api/moves", json={"name": "Relocation 2026"}, cookies=auth_cookies)
    assert res.status_code == 200
    move = res.json()

    res = client.post(f"/api/moves/{move['id']}/boxes", json={
        "label": "Heavy Tools",
        "destination": "Workshop"
    }, cookies=auth_cookies)
    assert res.status_code == 200
    box = res.json()
    assert box["number"] == 1

    # Pack item into box
    res = client.post(f"/api/boxes/{box['id']}/items", json=[it.id], cookies=auth_cookies)
    assert res.status_code == 200

    # Unpack box into loc2
    res = client.post(f"/api/boxes/{box['id']}/unpack", json={
        "item_ids": [it.id],
        "location_id": loc2.id
    }, cookies=auth_cookies)
    assert res.status_code == 200

    # Verify item moved to loc2
    db_session.expire_all()
    assert db_session.query(Item).filter(Item.id == it.id).first().location_id == loc2.id

    # 2. Label Templates
    res = client.post("/api/label-templates", json={
        "name": "Roll 50x30",
        "kind": "item",
        "width_mm": 50.0,
        "height_mm": 30.0,
        "layout": "qr_left",
        "fields_json": "[]",
        "is_default": True
    }, cookies=auth_cookies)
    assert res.status_code == 200
    tpl = res.json()
    assert tpl["is_default"] is True

    # 3. Excel Inventory Book Export
    res = client.get("/api/admin/export/book.xlsx", cookies=auth_cookies)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    # Open with openpyxl to verify sheets and NO quantity column
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    assert "All Items" in wb.sheetnames
    assert "Locations" in wb.sheetnames
    assert "Loans" in wb.sheetnames

    # Check headers for absence of any Qty/Quantity column
    all_sheet = wb["All Items"]
    header_values = [cell.value for cell in all_sheet[1]]
    for h in header_values:
        if h:
            assert "qty" not in str(h).lower()
            assert "quantity" not in str(h).lower()
            assert "stock" not in str(h).lower()
