import io
from PIL import Image
from backend.app.models import Category, Location, Item, Profile
from backend.app.core.security import create_session_token

def test_lifecycle_health_contacts(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    viewer = Profile(name="ViewerUser", role="viewer", is_active=1)
    db_session.add(viewer)
    db_session.commit()
    viewer_token = create_session_token({"profile_id": viewer.id, "role": "viewer"})

    cat = Category(name="LifeCat", icon="cat", color="#123")
    loc = Location(name="Closet", kind="Room")
    db_session.add_all([cat, loc])
    db_session.commit()

    # 1. Quick capture inbox
    fake_img = io.BytesIO()
    Image.new("RGB", (16, 16), color="red").save(fake_img, format="JPEG")
    fake_img.seek(0)
    res = client.post(
        "/api/inbox",
        data={"name": "Captured Kettle"},
        files={"photos": ("snap.jpg", fake_img, "image/jpeg")},
        cookies={"hi_session": admin_token}
    )
    assert res.status_code == 200
    inbox_item = res.json()
    assert "Captured Kettle" in inbox_item["name"]

    # Sort inbox item into inventory
    res = client.post(f"/api/inbox/{inbox_item['id']}/sort", json={
        "name": "Electric Kettle",
        "category_id": cat.id,
        "location_id": loc.id,
        "values": {}
    }, cookies={"hi_session": admin_token})
    assert res.status_code == 200

    # 2. Retire and Bring Back
    res = client.post(f"/api/items/{inbox_item['id']}/retire", json={
        "reason": "donated",
        "date": "2026-11-10",
        "note": "Donated to thrift shop"
    }, cookies={"hi_session": admin_token})
    assert res.status_code == 200

    # Item leaves active list
    res = client.get("/api/items?status=active", cookies={"hi_session": admin_token})
    assert all(it["id"] != inbox_item["id"] for it in res.json()["items"])

    # Item appears on retired list
    res = client.get("/api/items?status=retired", cookies={"hi_session": admin_token})
    assert any(it["id"] == inbox_item["id"] for it in res.json()["items"])

    # Bring back
    res = client.post(f"/api/items/{inbox_item['id']}/unretire", json={"location_id": loc.id}, cookies={"hi_session": admin_token})
    assert res.status_code == 200

    # 3. Contacts & Phone number stripping for Viewer
    res = client.post("/api/contacts", json={
        "name": "Rahul Verma",
        "phone": "+91 98765 43210",
        "note": "Neighbour"
    }, cookies={"hi_session": admin_token})
    assert res.status_code == 200
    contact = res.json()
    assert contact["phone"] == "+91 98765 43210"

    # Admin sees phone number
    res = client.get("/api/contacts", cookies={"hi_session": admin_token})
    assert res.json()[0]["phone"] == "+91 98765 43210"

    # Viewer sees NO phone number (stripped server-side)
    res = client.get("/api/contacts", cookies={"hi_session": viewer_token})
    assert res.json()[0]["phone"] is None

    # 4. Data Health
    res = client.get("/api/health", cookies={"hi_session": admin_token})
    assert res.status_code == 200
    h_data = res.json()
    assert "no_location" in h_data
    assert "no_photo" in h_data
    assert "duplicates" in h_data
