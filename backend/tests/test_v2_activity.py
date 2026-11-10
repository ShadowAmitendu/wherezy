from backend.app.models import Category, Location, Item
from backend.app.services.activity import record
from backend.app.core.security import create_session_token

def test_activity_recording_and_revert(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    cat = Category(name="ActivityCat", icon="cat", color="#123")
    loc1 = Location(name="Room A", kind="Room")
    loc2 = Location(name="Room B", kind="Room")
    db_session.add_all([cat, loc1, loc2])
    db_session.commit()

    # 1. Create item through API -> logs activity
    res = client.post("/api/items", json={
        "name": "Toaster",
        "category_id": cat.id,
        "location_id": loc1.id
    }, cookies=auth_cookies)
    assert res.status_code == 200
    item_id = res.json()["id"]

    # Check item activity
    res = client.get(f"/api/items/{item_id}/activity", cookies=auth_cookies)
    assert res.status_code == 200
    acts = res.json()
    assert len(acts) >= 1
    assert acts[0]["action"] == "created"

    # 2. Move item -> logs moved
    res = client.post(f"/api/items/{item_id}/move", json={"location_id": loc2.id}, cookies=auth_cookies)
    assert res.status_code == 200

    res = client.get(f"/api/items/{item_id}/activity", cookies=auth_cookies)
    acts = res.json()
    move_act = acts[0]
    assert move_act["action"] == "moved"

    # 3. Revert move -> moves back to loc1
    res = client.post(f"/api/activity/{move_act['id']}/revert", cookies=auth_cookies)
    assert res.status_code == 200

    # Verify item is back in loc1
    res = client.get(f"/api/items/{item_id}", cookies=auth_cookies)
    assert res.json()["location_id"] == loc1.id
