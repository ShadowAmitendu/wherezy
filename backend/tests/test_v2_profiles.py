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
        "accent_color": "#ff5722",
        "name": "Asha Updated",
        "avatar_emoji": "🦊"
    }, cookies={"hi_session": create_session_token({"profile_id": asha["id"], "role": "member"})})
    assert res.status_code == 200
    updated_prefs = res.json()
    assert updated_prefs["text_scale"] == 125
    assert updated_prefs["high_contrast"] is True
    assert updated_prefs["theme_mode"] == "dark"
    assert updated_prefs["accent_color"] == "#ff5722"
    assert updated_prefs["name"] == "Asha Updated"
    assert updated_prefs["avatar_emoji"] == "🦊"

def test_login_and_update_password_flow(client, db_session):
    # 1. Login with default credentials (admin / admin)
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "profile" in data
    assert data["profile"]["username"] == "admin"
    # Admin starts with must_change_password = True
    assert data["must_change_password"] is True
    assert "hi_session" in res.cookies
    session_cookie = res.cookies["hi_session"]

    # 2. Update password immediately
    res = client.post("/api/auth/update-password", json={
        "new_password": "NewAdminPassword123"
    }, cookies={"hi_session": session_cookie})
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["ok"] is True
    assert res_data["profile"]["must_change_password"] is False

    # 3. Old password should fail
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin"
    })
    assert res.status_code == 401

    # 4. New password should succeed
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "NewAdminPassword123"
    })
    assert res.status_code == 200
    assert res.json()["must_change_password"] is False
    new_token = res.cookies["hi_session"]

    # 5. Create user with custom role and granular permissions
    res = client.post("/api/profiles", json={
        "name": "Custom Worker",
        "username": "worker",
        "role": "custom",
        "password": "workerpass",
        "custom_permissions": ["items:write", "photos:write", "locations:read"]
    }, cookies={"hi_session": new_token})
    assert res.status_code == 200
    worker = res.json()
    assert worker["role"] == "custom"
    assert "items:write" in worker["custom_permissions"]

    # 6. Admin resets worker password with must_change_password=True
    res = client.put(f"/api/profiles/{worker['id']}", json={
        "password": "tempsecretpassword",
        "must_change_password": True
    }, cookies={"hi_session": new_token})
    assert res.status_code == 200
    assert res.json()["must_change_password"] is True

    # Reset admin password back to admin for ongoing dev convenience
    client.post("/api/auth/update-password", json={
        "new_password": "admin"
    }, cookies={"hi_session": new_token})

