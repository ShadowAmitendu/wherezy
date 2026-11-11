import io
from datetime import date, timedelta
from backend.app.models import Profile, Item
from backend.app.core.security import create_session_token


def test_bulk_create_items_flow(client, db_session):
    # Create category with track_expiry and required + optional custom fields
    res = client.post("/api/categories", json={
        "name": "Bulk Pantry",
        "icon": "kitchen",
        "color": "#4caf50",
        "track_expiry": True,
    })
    assert res.status_code == 200
    cat_id = res.json()["id"]

    res = client.post(f"/api/categories/{cat_id}/fields", json={
        "label": "Brand",
        "type": "text",
        "required": True,
    })
    assert res.status_code == 200
    brand_key = res.json()["key"]

    res = client.post(f"/api/categories/{cat_id}/fields", json={
        "label": "Quantity",
        "type": "number",
        "required": False,
    })
    assert res.status_code == 200
    qty_key = res.json()["key"]

    # Locations
    res = client.post("/api/locations", json={"name": "Kitchen", "kind": "Room"})
    kitchen_id = res.json()["id"]
    res = client.post("/api/locations", json={"name": "Top Shelf", "kind": "Shelf", "parent_id": kitchen_id})
    shelf_id = res.json()["id"]
    res = client.post("/api/locations", json={"name": "Pantry Annex", "kind": "Room"})
    annex_id = res.json()["id"]

    exp_date = (date.today() + timedelta(days=20)).isoformat()

    # 1. Happy path bulk create with shared defaults + per-item override
    res = client.post("/api/items/bulk-create", json={
        "category_id": cat_id,
        "location_id": shelf_id,
        "expiry_date": exp_date,
        "notes": "Bulk stocked",
        "values": {brand_key: "Generic", qty_key: 1},
        "items": [
            {"name": "Rolled Oats"},
            {"name": "Brown Rice", "notes": "Reserve bag", "values": {qty_key: 2}},
            {"name": "Olive Oil", "location_id": annex_id, "values": {brand_key: "Kirkland"}},
        ],
    })
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["created_count"] == 3
    assert data["batch_id"]
    assert len(data["items"]) == 3

    items_by_name = {it["name"]: it for it in data["items"]}
    assert items_by_name["Rolled Oats"]["location_id"] == shelf_id
    assert items_by_name["Rolled Oats"]["notes"] == "Bulk stocked"
    assert items_by_name["Rolled Oats"]["values"][brand_key] == "Generic"
    assert items_by_name["Rolled Oats"]["values"][qty_key] == 1
    assert items_by_name["Brown Rice"]["notes"] == "Reserve bag"
    assert items_by_name["Brown Rice"]["values"][qty_key] == 2
    assert items_by_name["Olive Oil"]["location_id"] == annex_id
    assert items_by_name["Olive Oil"]["values"][brand_key] == "Kirkland"

    # Activity entries share batch_id
    act_res = client.get(f"/api/activity?batch_id={data['batch_id']}")
    assert act_res.status_code == 200
    events = act_res.json()["items"]
    assert len(events) == 3
    assert all(ev["batch_id"] == data["batch_id"] and ev["action"] == "created" for ev in events)

    # 2. Empty items list -> 422
    res = client.post("/api/items/bulk-create", json={
        "category_id": cat_id,
        "values": {brand_key: "Generic"},
        "items": [],
    })
    assert res.status_code == 422

    # 3. Blank name mid-batch fails atomically (no partial inserts)
    count_before = db_session.query(Item).count()
    res = client.post("/api/items/bulk-create", json={
        "category_id": cat_id,
        "values": {brand_key: "Generic"},
        "items": [{"name": "Valid Should Rollback"}, {"name": "   "}],
    })
    assert res.status_code == 422
    assert db_session.query(Item).count() == count_before

    # 4. Missing required category custom field -> 422
    res = client.post("/api/items/bulk-create", json={
        "category_id": cat_id,
        "items": [{"name": "Missing Brand Item"}],
    })
    assert res.status_code == 422
    assert db_session.query(Item).count() == count_before

    # 5. Missing category / location -> 404
    res = client.post("/api/items/bulk-create", json={
        "category_id": 999999,
        "items": [{"name": "Ghost Cat"}],
    })
    assert res.status_code == 404

    res = client.post("/api/items/bulk-create", json={
        "category_id": cat_id,
        "location_id": 999999,
        "values": {brand_key: "Generic"},
        "items": [{"name": "Ghost Loc"}],
    })
    assert res.status_code == 404

    # 6. Viewer permission check -> 403
    viewer = Profile(name="BulkViewer", role="viewer", is_active=1)
    db_session.add(viewer)
    db_session.commit()
    viewer_token = create_session_token({"profile_id": viewer.id, "role": "viewer"})
    res = client.post(
        "/api/items/bulk-create",
        json={"category_id": cat_id, "values": {brand_key: "Generic"}, "items": [{"name": "Denied"}]},
        cookies={"hi_session": viewer_token},
    )
    assert res.status_code == 403


def test_import_csv_with_locations_and_validation(client, db_session):
    res = client.post("/api/categories", json={
        "name": "Medicine CSV",
        "icon": "medical",
        "color": "#e53935",
        "track_expiry": True,
    })
    assert res.status_code == 200
    cat_id = res.json()["id"]

    res = client.post(f"/api/categories/{cat_id}/fields", json={"label": "Brand", "type": "text", "required": True})
    brand_key = res.json()["key"]
    res = client.post(f"/api/categories/{cat_id}/fields", json={"label": "Count", "type": "number", "required": False})
    count_key = res.json()["key"]
    res = client.post(f"/api/categories/{cat_id}/fields", json={"label": "Essential", "type": "checkbox", "required": False})
    essential_key = res.json()["key"]
    res = client.post(f"/api/categories/{cat_id}/fields", json={"label": "Uses", "type": "multiselect", "required": False, "options": ["Pain", "Fever", "Allergy"]})
    uses_key = res.json()["key"]

    # Locations including duplicate child names ("Shelf 1")
    kitchen_id = client.post("/api/locations", json={"name": "Bathroom", "kind": "Room"}).json()["id"]
    bath_shelf_id = client.post("/api/locations", json={"name": "Shelf 1", "kind": "Shelf", "parent_id": kitchen_id}).json()["id"]
    garage_id = client.post("/api/locations", json={"name": "Garage", "kind": "Room"}).json()["id"]
    client.post("/api/locations", json={"name": "Shelf 1", "kind": "Shelf", "parent_id": garage_id})
    fallback_id = client.post("/api/locations", json={"name": "Travel Kit", "kind": "Box"}).json()["id"]

    exp = (date.today() + timedelta(days=90)).isoformat()
    csv_body = (
        "Name,Location,Expiry Date,Notes,Brand,Count,Essential,Uses\n"
        f"Ibuprofen,Bathroom > Shelf 1,{exp},200mg tabs,Advil,24,yes,\"Pain, Fever\"\n"
        "Bandages,Garage,,Assorted box,Band-Aid,40,true,\n"
        "Antacid,,,Roll in bag,Tums,12,no,Allergy\n"
    ).encode("utf-8")

    # 1. Dry-run preview must validate without committing
    res = client.post(
        f"/api/admin/import-csv?category_id={cat_id}&dry_run=true&location_id={fallback_id}",
        files={"file": ("meds.csv", io.BytesIO(csv_body), "text/csv")},
    )
    assert res.status_code == 200
    preview = res.json()
    assert preview["ok"] is True
    assert preview["dry_run"] is True
    assert preview["total_rows"] == 3
    assert preview["imported_count"] == 3
    assert preview["errors"] == []
    assert db_session.query(Item).filter(Item.category_id == cat_id).count() == 0

    # 2. Live import commits items with resolved & fallback locations
    res = client.post(
        f"/api/admin/import-csv?category_id={cat_id}&dry_run=false&location_id={fallback_id}",
        files={"file": ("meds.csv", io.BytesIO(csv_body), "text/csv")},
    )
    assert res.status_code == 200
    result = res.json()
    assert result["ok"] is True
    assert result["dry_run"] is False
    assert result["imported_count"] == 3

    listed = client.get(f"/api/items?category_id={cat_id}").json()["items"]
    by_name = {it["name"]: it for it in listed}
    assert len(by_name) == 3
    assert by_name["Ibuprofen"]["location_id"] == bath_shelf_id
    assert by_name["Ibuprofen"]["expiry_date"] == exp
    assert by_name["Ibuprofen"]["values"][brand_key] == "Advil"
    assert by_name["Ibuprofen"]["values"][count_key] == 24
    assert by_name["Ibuprofen"]["values"][essential_key] is True
    assert by_name["Ibuprofen"]["values"][uses_key] == ["Pain", "Fever"]
    assert by_name["Bandages"]["location_id"] == garage_id
    assert by_name["Antacid"]["location_id"] == fallback_id

    # 3. Invalid CSV rows fail cleanly without committing partial items
    bad_csv = (
        "Name,Location,Brand,Count\n"
        ",Garage,Bayer,10\n"
        "Ambiguous Item,Shelf 1,Bayer,10\n"
        "Missing Loc Item,Attic,Bayer,10\n"
        "Bad Number Item,Garage,Bayer,ten\n"
        "Missing Req Item,Garage,,5\n"
    ).encode("utf-8")
    before_count = db_session.query(Item).filter(Item.category_id == cat_id).count()
    res = client.post(
        f"/api/admin/import-csv?category_id={cat_id}&dry_run=false",
        files={"file": ("bad.csv", io.BytesIO(bad_csv), "text/csv")},
    )
    assert res.status_code == 200
    bad_res = res.json()
    assert bad_res["ok"] is False
    assert bad_res["imported_count"] == 0
    assert len(bad_res["errors"]) == 5
    assert "Name is required" in bad_res["errors"][0]
    assert "multiple locations" in bad_res["errors"][1]
    assert "not found" in bad_res["errors"][2]
    assert "must be a number" in bad_res["errors"][3]
    assert "is required" in bad_res["errors"][4]
    assert db_session.query(Item).filter(Item.category_id == cat_id).count() == before_count

    # 4. Non-existent default location_id -> 404
    res = client.post(
        f"/api/admin/import-csv?category_id={cat_id}&dry_run=true&location_id=999999",
        files={"file": ("meds.csv", io.BytesIO(csv_body), "text/csv")},
    )
    assert res.status_code == 404
