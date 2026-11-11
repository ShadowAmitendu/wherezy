import io
import sqlite3
import tempfile
from pathlib import Path
import openpyxl
from backend.app.core.migrations import run_migrations


def _setup_cat_and_loc(client):
    cat = client.post(
        "/api/categories",
        json={"name": "Hardware Qty Test", "icon": "build", "color": "#1976d2", "track_expiry": False},
    ).json()
    loc = client.post("/api/locations", json={"name": "Workbench", "kind": "Room"}).json()
    return cat["id"], loc["id"]


def test_quantity_and_partial_taken_out_flow(client):
    cat_id, loc_id = _setup_cat_and_loc(client)

    # Default quantity = 1
    r_def = client.post("/api/items", json={"name": "Claw Hammer", "category_id": cat_id, "location_id": loc_id})
    assert r_def.status_code == 200
    d_item = r_def.json()
    assert d_item["quantity"] == 1
    assert d_item["taken_out"] is False
    assert d_item["taken_out_quantity"] == 0
    assert d_item["available_quantity"] == 1

    # Invalid quantity < 1
    r_bad = client.post("/api/items", json={"name": "Bad Qty", "category_id": cat_id, "quantity": 0})
    assert r_bad.status_code == 422

    # Multi-quantity item (quantity=5)
    r_multi = client.post(
        "/api/items",
        json={"name": "AA Batteries", "category_id": cat_id, "location_id": loc_id, "quantity": 5},
    )
    assert r_multi.status_code == 200
    bat = r_multi.json()
    bat_id = bat["id"]
    assert bat["quantity"] == 5
    assert bat["taken_out_quantity"] == 0
    assert bat["available_quantity"] == 5

    # Take out 3 of 5
    r_take3 = client.post(
        f"/api/items/{bat_id}/taken",
        json={"taken_out": True, "taken_out_quantity": 3, "taken_by": "Alex"},
    )
    assert r_take3.status_code == 200
    t3 = r_take3.json()
    assert t3["taken_out"] is True
    assert t3["taken_out_quantity"] == 3
    assert t3["available_quantity"] == 2
    assert t3["taken_by"] == "Alex"

    # Dashboard reflects unit totals
    dash = client.get("/api/dashboard").json()
    assert dash["total_items"] == 2
    assert dash["total_quantity"] == 6
    assert dash["taken_out_count"] == 1
    assert dash["taken_out_quantity_total"] == 3

    # Adjust count without wiping borrower (4 out -> then partial return to 1 out)
    r_take4 = client.post(f"/api/items/{bat_id}/taken", json={"taken_out_quantity": 4})
    assert r_take4.status_code == 200
    assert r_take4.json()["taken_out_quantity"] == 4
    assert r_take4.json()["available_quantity"] == 1
    assert r_take4.json()["taken_by"] == "Alex"

    r_take1 = client.post(f"/api/items/{bat_id}/taken", json={"taken_out_quantity": 1})
    assert r_take1.status_code == 200
    assert r_take1.json()["taken_out"] is True
    assert r_take1.json()["taken_out_quantity"] == 1
    assert r_take1.json()["available_quantity"] == 4

    # Cannot exceed total quantity
    r_over = client.post(f"/api/items/{bat_id}/taken", json={"taken_out": True, "taken_out_quantity": 6})
    assert r_over.status_code == 422

    # Contradictory flags rejected
    r_contra = client.post(f"/api/items/{bat_id}/taken", json={"taken_out": False, "taken_out_quantity": 2})
    assert r_contra.status_code == 422

    # Take 3 again, then reject lowering total quantity below 3
    client.post(f"/api/items/{bat_id}/taken", json={"taken_out_quantity": 3})
    r_low = client.put(f"/api/items/{bat_id}", json={"quantity": 2})
    assert r_low.status_code == 422

    # Raising total quantity to 6 works cleanly
    r_up = client.put(f"/api/items/{bat_id}", json={"quantity": 6})
    assert r_up.status_code == 200
    assert r_up.json()["quantity"] == 6
    assert r_up.json()["taken_out_quantity"] == 3
    assert r_up.json()["available_quantity"] == 3

    # Duplicate preserves quantity and resets taken_out_quantity
    r_dup = client.post(f"/api/items/{bat_id}/duplicate")
    assert r_dup.status_code == 200
    dup = r_dup.json()
    assert dup["quantity"] == 6
    assert dup["taken_out"] is False
    assert dup["taken_out_quantity"] == 0
    assert dup["available_quantity"] == 6

    # Retire blocked while units are taken out
    r_ret = client.post(
        f"/api/items/{bat_id}/retire",
        json={"reason": "donated", "date": "2026-11-10"},
    )
    assert r_ret.status_code == 400

    # Activity revert restores previous taken_out_quantity (3 -> undo? revert last taken_out event)
    acts = client.get(f"/api/items/{bat_id}/activity").json()
    last_taken_act = next(a for a in acts if a["action"] == "taken_out")
    rev = client.post(f"/api/activity/{last_taken_act['id']}/revert")
    assert rev.status_code == 200
    reverted_item = client.get(f"/api/items/{bat_id}").json()
    assert reverted_item["taken_out_quantity"] == 1

    # Return all via taken_out=False
    r_ret_all = client.post(f"/api/items/{bat_id}/taken", json={"taken_out": False})
    assert r_ret_all.status_code == 200
    assert r_ret_all.json()["taken_out"] is False
    assert r_ret_all.json()["taken_out_quantity"] == 0
    assert r_ret_all.json()["available_quantity"] == 6
    assert r_ret_all.json()["taken_by"] is None


def test_quantity_bulk_csv_and_exports(client):
    cat_id, loc_id = _setup_cat_and_loc(client)

    # Bulk create with shared + per-item quantity
    r_bulk = client.post(
        "/api/items/bulk-create",
        json={
            "category_id": cat_id,
            "location_id": loc_id,
            "quantity": 4,
            "items": [
                {"name": "M4 Bolts"},
                {"name": "M6 Nuts", "quantity": 12},
            ],
        },
    )
    assert r_bulk.status_code == 200
    by_name = {it["name"]: it for it in r_bulk.json()["items"]}
    assert by_name["M4 Bolts"]["quantity"] == 4
    assert by_name["M6 Nuts"]["quantity"] == 12

    # CSV import with Quantity column (plus invalid Quantity row check)
    good_csv = (
        "Name,Location,Quantity,Notes\n"
        "Washers,Workbench,20,Steel\n"
        "Locknut,Workbench,,Default one\n"
    ).encode("utf-8")
    r_csv = client.post(
        f"/api/admin/import-csv?category_id={cat_id}&dry_run=false",
        files={"file": ("qty.csv", io.BytesIO(good_csv), "text/csv")},
    )
    assert r_csv.status_code == 200
    assert r_csv.json()["ok"] is True
    assert r_csv.json()["imported_count"] == 2

    listed = {it["name"]: it for it in client.get(f"/api/items?category_id={cat_id}").json()["items"]}
    assert listed["Washers"]["quantity"] == 20
    assert listed["Locknut"]["quantity"] == 1

    bad_csv = "Name,Quantity\nInvalidZero,0\nInvalidAlpha,abc\n".encode("utf-8")
    r_bad_csv = client.post(
        f"/api/admin/import-csv?category_id={cat_id}&dry_run=true",
        files={"file": ("bad_qty.csv", io.BytesIO(bad_csv), "text/csv")},
    )
    assert r_bad_csv.status_code == 200
    assert r_bad_csv.json()["ok"] is False
    assert len(r_bad_csv.json()["errors"]) == 2

    # Take out 3 of M4 Bolts so Loans sheet is populated too
    bolts_id = by_name["M4 Bolts"]["id"]
    client.post(f"/api/items/{bolts_id}/taken", json={"taken_out": True, "taken_out_quantity": 3, "taken_by": "Sam"})

    # JSON & CSV exports contain quantity fields
    j_exp = client.get("/api/admin/export?format=json").json()
    j_bolts = next(x for x in j_exp if x["id"] == bolts_id)
    assert j_bolts["quantity"] == 4
    assert j_bolts["taken_out_quantity"] == 3
    assert j_bolts["available_quantity"] == 1

    c_exp = client.get("/api/admin/export?format=csv").text
    assert "Quantity" in c_exp.splitlines()[0]
    assert "Taken Out Qty" in c_exp.splitlines()[0]

    # Excel workbook includes Quantity & Taken Out Qty columns
    x_res = client.get("/api/admin/export/book.xlsx")
    assert x_res.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(x_res.content))
    all_headers = [c.value for c in wb["All Items"][1]]
    assert "Quantity" in all_headers
    assert "Taken Out Qty" in all_headers
    loan_headers = [c.value for c in wb["Loans"][1]]
    assert "Taken Out Qty" in loan_headers
    assert "Total Qty" in loan_headers

    # Bulk set_taken + undo preserves taken_out_quantity
    nuts_id = by_name["M6 Nuts"]["id"]
    b_taken = client.post(
        "/api/items/bulk",
        json={"ids": [nuts_id], "action": "set_taken", "params": {"taken_out": True, "taken_out_quantity": 5, "taken_by": "Mia"}},
    ).json()
    assert b_taken["changed"] == 1
    assert client.get(f"/api/items/{nuts_id}").json()["taken_out_quantity"] == 5

    client.post(f"/api/batches/{b_taken['batch_id']}/undo")
    restored_nuts = client.get(f"/api/items/{nuts_id}").json()
    assert restored_nuts["taken_out"] is False
    assert restored_nuts["taken_out_quantity"] == 0


def test_migration_012_backfills_taken_out_quantity():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "legacy.db"
        # Apply migrations 001..011 manually by copying DB up to version 11, or run full and test directly via fresh sqlite
        # First run migrations normally to get schema at latest version, then rewind/test 012 SQL on a simulated v11 table
        conn = sqlite3.connect(str(db_path))
        try:
            migrations_dir = Path(__file__).resolve().parents[1] / "app" / "migrations"
            for sql_file in sorted(migrations_dir.glob("*.sql")):
                ver = int(sql_file.name.split("_")[0])
                if ver <= 11:
                    conn.executescript(sql_file.read_text(encoding="utf-8"))
                    conn.execute(f"PRAGMA user_version = {ver}")
            row = conn.execute("SELECT id FROM categories ORDER BY id LIMIT 1").fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO categories(id, name, icon, color, track_expiry, created_at, updated_at) "
                    "VALUES(1, 'Tools', 'build', '#000000', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
                )
                cat_id = 1
            else:
                cat_id = row[0]
            conn.execute(
                "INSERT INTO items(id, category_id, name, taken_out, created_at, updated_at) "
                "VALUES(10, ?, 'Wrench', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                (cat_id,),
            )
            conn.execute(
                "INSERT INTO items(id, category_id, name, taken_out, created_at, updated_at) "
                "VALUES(11, ?, 'Pliers', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                (cat_id,),
            )
            conn.commit()
        finally:
            conn.close()

        run_migrations(db_path)

        check = sqlite3.connect(str(db_path))
        try:
            rows = dict(
                (r[0], (r[1], r[2]))
                for r in check.execute("SELECT id, quantity, taken_out_quantity FROM items ORDER BY id").fetchall()
            )
            ver_row = check.execute("PRAGMA user_version").fetchone()[0]
        finally:
            check.close()

        assert ver_row >= 12
        assert rows[10] == (1, 1)
        assert rows[11] == (1, 0)
