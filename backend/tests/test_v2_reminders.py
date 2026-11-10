import json
from pathlib import Path
from datetime import date
from backend.app.models import Category, FieldDef, Item, Profile
from backend.app.services.reminders import compute_reminders
from backend.app.core.security import create_session_token

FIXTURES_PATH = Path(__file__).parent / "fixtures" / "reminders_golden.json"

def test_reminders_golden_fixtures(client, db_session):
    with open(FIXTURES_PATH, "r") as f:
        golden = json.load(f)

    ref_date = golden["reference_date"]

    cat = Category(name="Meds", track_expiry=1, expiry_lead_days=7)
    db_session.add(cat)
    db_session.commit()

    fdef_warranty = FieldDef(category_id=cat.id, key="warranty_until", label="Warranty Until", type="date", remind=1, remind_lead_days=30)
    fdef_opened = FieldDef(category_id=cat.id, key="opened_on", label="Opened On", type="date", remind=1, remind_lead_days=3, remind_offset_days=28)
    db_session.add_all([fdef_warranty, fdef_opened])
    db_session.commit()

    # Seed test items according to golden cases
    for case in golden["cases"]:
        vals = {}
        if case["source_type"] == "field":
            vals[case["field_key"]] = case["field_date_value"]

        it = Item(
            id=case["item_id"],
            name=case["item_name"],
            category_id=cat.id,
            expiry_date=case.get("expiry_date"),
            taken_out=case.get("taken_out", 0),
            taken_due=case.get("taken_due"),
            values_json=json.dumps(vals),
            status="active"
        )
        db_session.add(it)
    db_session.commit()

    rems = compute_reminders(db=db_session, profile_id=1, ref_date=ref_date)
    rem_map = {f"{r.source_type}:{r.item_id}": r for r in rems}

    for case in golden["cases"]:
        key = f"{case['source_type']}:{case['item_id']}"
        assert key in rem_map, f"Missing reminder for case {case['id']}"
        rem = rem_map[key]
        assert rem.due_date == case["expected_due_date"], f"Due date mismatch for {case['id']}"
        assert rem.status == case["expected_status"], f"Status mismatch for {case['id']}"

def test_reminders_snooze_and_dismiss(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    cat = Category(name="SnoozeCat", track_expiry=1, expiry_lead_days=30)
    db_session.add(cat)
    db_session.commit()

    today_str = date.today().isoformat()
    it = Item(name="Eggs", category_id=cat.id, expiry_date=today_str, status="active")
    db_session.add(it)
    db_session.commit()

    # 1. Snooze reminder
    res = client.post("/api/reminders/snooze", json={
        "source_type": "expiry",
        "item_id": it.id,
        "due_date": today_str,
        "snooze_days": 7
    }, cookies=auth_cookies)
    assert res.status_code == 200

    # Verify status is snoozed
    res = client.get("/api/reminders", cookies=auth_cookies)
    assert res.status_code == 200
    egg_rem = next(r for r in res.json() if r["item_id"] == it.id)
    assert egg_rem["status"] == "snoozed"

    # 2. Dismiss reminder
    res = client.post("/api/reminders/dismiss", json={
        "source_type": "expiry",
        "item_id": it.id,
        "due_date": today_str
    }, cookies=auth_cookies)
    assert res.status_code == 200

    res = client.get("/api/reminders", cookies=auth_cookies)
    egg_rem = next(r for r in res.json() if r["item_id"] == it.id)
    assert egg_rem["status"] == "dismissed"
