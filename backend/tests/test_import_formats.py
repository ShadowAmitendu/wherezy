import csv
import io
import json
import openpyxl


def _seed_categories_and_locations(client):
    r_room = client.post("/api/locations", json={"name": "Office", "kind": "room"})
    assert r_room.status_code == 200
    room_id = r_room.json()["id"]

    r_shelf = client.post("/api/locations", json={"name": "Top Shelf", "kind": "shelf", "parent_id": room_id})
    assert r_shelf.status_code == 200
    shelf_id = r_shelf.json()["id"]

    # Ambiguous leaf name under another room
    r_other = client.post("/api/locations", json={"name": "Kitchen", "kind": "room"})
    assert r_other.status_code == 200
    r_dup = client.post(
        "/api/locations",
        json={"name": "Top Shelf", "kind": "shelf", "parent_id": r_other.json()["id"]},
    )
    assert r_dup.status_code == 200

    c_elec = client.post("/api/categories", json={"name": "Electronics", "track_expiry": True})
    assert c_elec.status_code == 200
    elec_id = c_elec.json()["id"]
    client.post(
        f"/api/categories/{elec_id}/fields",
        json={"key": "brand", "label": "Brand", "type": "text", "required": True},
    )
    client.post(
        f"/api/categories/{elec_id}/fields",
        json={"key": "wattage", "label": "Wattage", "type": "number", "required": False},
    )

    c_books = client.post("/api/categories", json={"name": "Books", "track_expiry": False})
    assert c_books.status_code == 200
    books_id = c_books.json()["id"]
    client.post(
        f"/api/categories/{books_id}/fields",
        json={"key": "author", "label": "Author", "type": "text", "required": True},
    )

    return {
        "room_id": room_id,
        "shelf_id": shelf_id,
        "elec_id": elec_id,
        "books_id": books_id,
    }


def test_import_template_endpoints(client):
    seeded = _seed_categories_and_locations(client)

    for fmt in ("csv", "json", "xlsx"):
        res = client.get(f"/api/admin/import/template?format={fmt}&category_id={seeded['elec_id']}")
        assert res.status_code == 200
        if fmt == "csv":
            headers = next(csv.reader(io.StringIO(res.text)))
            assert headers == ["Name", "Location", "Quantity", "Notes", "Expiry Date", "Brand", "Wattage"]
        elif fmt == "json":
            data = json.loads(res.text)
            assert isinstance(data, list) and len(data) == 1
            assert data[0]["category"] == "Electronics"
            assert "brand" in data[0]["values"]
        else:
            wb = openpyxl.load_workbook(io.BytesIO(res.content))
            ws = wb.active
            headers = [cell.value for cell in ws[1]]
            assert headers == ["Name", "Location", "Quantity", "Notes", "Expiry Date", "Brand", "Wattage"]
            wb.close()

    # Without category_id includes Category column in template
    res_generic = client.get("/api/admin/import/template?format=csv")
    assert res_generic.status_code == 200
    assert next(csv.reader(io.StringIO(res_generic.text))) == ["Name", "Category", "Location", "Quantity", "Notes"]


def test_import_json_dry_run_commit_errors_and_undo(client):
    seeded = _seed_categories_and_locations(client)

    bad_payload = [
        {"name": "MissingBrand", "category": "Electronics", "quantity": 1},
        {"name": "InvalidQty", "category": "Books", "quantity": 0, "values": {"author": "Alice"}},
        {"name": "AmbiguousLoc", "category": "Books", "location": "Top Shelf", "values": {"author": "Bob"}},
    ]
    res_bad = client.post(
        "/api/admin/import?format=json&dry_run=true",
        files={"file": ("bad.json", io.BytesIO(json.dumps(bad_payload).encode("utf-8")), "application/json")},
    )
    assert res_bad.status_code == 200
    body_bad = res_bad.json()
    assert body_bad["ok"] is False
    assert body_bad["total_rows"] == 3
    assert len(body_bad["errors"]) == 3
    assert "'Brand' is required" in body_bad["errors"][0]
    assert "'Quantity' must be a whole number >= 1" in body_bad["errors"][1]
    assert "multiple locations" in body_bad["errors"][2]

    good_payload = {
        "items": [
            {
                "name": "Bench Supply",
                "category": "Electronics",
                "location": "Office > Top Shelf",
                "quantity": 2,
                "expiry_date": "2028-01-15",
                "values": {"brand": "Rigol", "wattage": 120},
            },
            {
                "name": "Clean Architecture",
                "category": "Books",
                "Author": "Robert Martin",
            },
        ]
    }
    res_dry = client.post(
        f"/api/admin/import?format=json&dry_run=true&location_id={seeded['room_id']}",
        files={"file": ("items.json", io.BytesIO(json.dumps(good_payload).encode("utf-8")), "application/json")},
    )
    assert res_dry.status_code == 200
    assert res_dry.json()["ok"] is True
    assert res_dry.json()["imported_count"] == 2
    assert res_dry.json()["batch_id"] is None

    res_commit = client.post(
        f"/api/admin/import?format=json&dry_run=false&location_id={seeded['room_id']}",
        files={"file": ("items.json", io.BytesIO(json.dumps(good_payload).encode("utf-8")), "application/json")},
    )
    assert res_commit.status_code == 200
    commit_data = res_commit.json()
    assert commit_data["ok"] is True
    assert commit_data["imported_count"] == 2
    batch_id = commit_data["batch_id"]
    assert batch_id

    listed = client.get("/api/items").json()["items"]
    by_name = {it["name"]: it for it in listed}
    assert by_name["Bench Supply"]["location_id"] == seeded["shelf_id"]
    assert by_name["Bench Supply"]["quantity"] == 2
    assert by_name["Bench Supply"]["values"] == {"brand": "Rigol", "wattage": 120}
    assert by_name["Clean Architecture"]["location_id"] == seeded["room_id"]
    assert by_name["Clean Architecture"]["values"] == {"author": "Robert Martin"}

    # Undo batch removes all imported items
    res_undo = client.post(f"/api/batches/{batch_id}/undo")
    assert res_undo.status_code == 200
    assert client.get("/api/items").json()["total"] == 0


def test_import_xlsx_single_sheet_and_roundtrip_export_book(client):
    seeded = _seed_categories_and_locations(client)

    # Single-sheet Excel upload using category fallback + formula-escaped text
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "New Gear"
    ws.append(["Name", "Location", "Quantity", "Brand", "Wattage", "Notes"])
    ws.append(["USB-C Hub", "Office > Top Shelf", 3, "Anker", 65, "'=FormulaNote"])
    buf = io.BytesIO()
    wb.save(buf)
    wb.close()

    res_single = client.post(
        f"/api/admin/import?dry_run=false&category_id={seeded['elec_id']}",
        files={
            "file": (
                "gear.xlsx",
                io.BytesIO(buf.getvalue()),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert res_single.status_code == 200
    assert res_single.json()["ok"] is True
    assert res_single.json()["imported_count"] == 1

    # Add a second item in Books so export book has multiple category sheets + All Items + Locations + Loans
    r_book = client.post(
        "/api/items",
        json={
            "name": "Designing Data-Intensive Applications",
            "category_id": seeded["books_id"],
            "location_id": seeded["room_id"],
            "values": {"author": "Martin Kleppmann"},
        },
    )
    assert r_book.status_code == 200

    # Export multi-sheet Excel workbook, JSON, and CSV
    book_res = client.get("/api/admin/export/book.xlsx")
    assert book_res.status_code == 200
    json_exp_res = client.get("/api/admin/export?format=json")
    assert json_exp_res.status_code == 200
    csv_exp_res = client.get("/api/admin/export?format=csv")
    assert csv_exp_res.status_code == 200

    # Wipe items then round-trip restore via exported book.xlsx (no duplicate imports from All Items!)
    for item in client.get("/api/items").json()["items"]:
        client.delete(f"/api/items/{item['id']}?permanent=true")
    assert client.get("/api/items").json()["total"] == 0

    r_reimport_xlsx = client.post(
        "/api/admin/import?format=xlsx&dry_run=false",
        files={
            "file": (
                "wherezy_book.xlsx",
                io.BytesIO(book_res.content),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert r_reimport_xlsx.status_code == 200
    assert r_reimport_xlsx.json()["ok"] is True
    assert r_reimport_xlsx.json()["imported_count"] == 2

    reimported = {it["name"]: it for it in client.get("/api/items").json()["items"]}
    assert reimported["USB-C Hub"]["values"] == {"brand": "Anker", "wattage": 65}
    assert reimported["Designing Data-Intensive Applications"]["values"] == {"author": "Martin Kleppmann"}

    # Round-trip restore via exported CSV (with scoped "<Category> - <Label>" headers) & JSON
    for item in client.get("/api/items").json()["items"]:
        client.delete(f"/api/items/{item['id']}?permanent=true")

    r_reimport_csv = client.post(
        "/api/admin/import?format=csv&dry_run=false",
        files={"file": ("wherezy_export.csv", io.BytesIO(csv_exp_res.content), "text/csv")},
    )
    assert r_reimport_csv.status_code == 200
    assert r_reimport_csv.json()["ok"] is True
    assert r_reimport_csv.json()["imported_count"] == 2
    csv_items = {it["name"]: it for it in client.get("/api/items").json()["items"]}
    assert csv_items["USB-C Hub"]["notes"] == "=FormulaNote"
    assert csv_items["USB-C Hub"]["values"] == {"brand": "Anker", "wattage": 65}

    for item in client.get("/api/items").json()["items"]:
        client.delete(f"/api/items/{item['id']}?permanent=true")

    r_reimport_json = client.post(
        "/api/admin/import?dry_run=false",
        files={"file": ("wherezy_export.json", io.BytesIO(json_exp_res.content), "application/json")},
    )
    assert r_reimport_json.status_code == 200
    assert r_reimport_json.json()["ok"] is True
    assert r_reimport_json.json()["imported_count"] == 2


def test_import_rejects_corrupted_xlsx_or_invalid_json(client):
    r_bad_xlsx = client.post(
        "/api/admin/import?format=xlsx&dry_run=true",
        files={"file": ("broken.xlsx", io.BytesIO(b"not-a-zip"), "application/octet-stream")},
    )
    assert r_bad_xlsx.status_code == 400

    r_bad_json = client.post(
        "/api/admin/import?format=json&dry_run=true",
        files={"file": ("bad.json", io.BytesIO(b'{"wrong": true}'), "application/json")},
    )
    assert r_bad_json.status_code == 400
