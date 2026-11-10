import pytest
from backend.app.models import Profile
from backend.app.core.security import create_session_token

def test_profiles_crud_and_guards(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    auth_cookies = {"hi_session": admin_token}

    # 1. Create member profile with PIN
    res = client.post("/api/profiles", json={
        "name": "Asha",
        "color": "#e91e63",
        "avatar_emoji": "👩",
        "role": "member",
        "pin": "1234"
    }, cookies=auth_cookies)
    assert res.status_code == 200
    asha = res.json()
    assert asha["name"] == "Asha"
    assert asha["has_pin"] is True

    # 2. Select profile with correct PIN
    res = client.post("/api/profiles/select", json={
        "profile_id": asha["id"],
        "pin": "1234"
    })
    assert res.status_code == 200
    assert "hi_session" in res.cookies

    # 3. Select with incorrect PIN
    res = client.post("/api/profiles/select", json={
        "profile_id": asha["id"],
        "pin": "9999"
    })
    assert res.status_code == 401

    # 4. Cannot deactivate the last remaining admin
    res = client.delete("/api/profiles/1", cookies=auth_cookies)
    assert res.status_code == 400
    assert "LAST_ADMIN" in res.text

    # 5. Display profile creation and restrictions
    res = client.post("/api/profiles", json={
        "name": "Kitchen Wall Tablet",
        "is_display": True
    }, cookies=auth_cookies)
    assert res.status_code == 200
    display_p = res.json()
    assert display_p["is_display"] is True
    assert display_p["role"] == "viewer"
    assert display_p["has_pin"] is False

    # 6. Update display preferences
    res = client.put("/api/profiles/me/prefs", json={
        "text_scale": 125,
        "high_contrast": True,
        "theme_mode": "dark",
        "accent_color": "#ff5722"
    }, cookies={"hi_session": create_session_token({"profile_id": asha["id"], "role": "member"})})
    assert res.status_code == 200
    updated_prefs = res.json()
    assert updated_prefs["text_scale"] == 125
    assert updated_prefs["high_contrast"] is True
    assert updated_prefs["theme_mode"] == "dark"
    assert updated_prefs["accent_color"] == "#ff5722"
