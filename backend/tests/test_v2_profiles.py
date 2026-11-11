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
    # Restore admin session cookie after step 2's profile/select switched client cookies to Asha
    client.cookies.clear()
    client.cookies.set("hi_session", admin_token)
    res = client.delete("/api/profiles/1")
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
    res = client.post("/api/auth/update-password", json={
        "current_password": "NewAdminPassword123",
        "new_password": "admin"
    }, cookies={"hi_session": new_token})
    assert res.status_code == 200


def _make_png_bytes(color=(30, 136, 229, 255)) -> bytes:
    import io
    from PIL import Image

    buf = io.BytesIO()
    img = Image.new("RGBA", (32, 32), color)
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_profile_avatar_upload_replace_remove_and_permissions(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    admin_cookies = {"hi_session": admin_token}

    # Create a member, co_admin, and display profile
    member = client.post("/api/profiles", json={"name": "Maya", "role": "member"}, cookies=admin_cookies).json()
    co_admin = client.post("/api/profiles", json={"name": "Sam", "role": "co_admin"}, cookies=admin_cookies).json()
    display = client.post("/api/profiles", json={"name": "Hallway", "is_display": True}, cookies=admin_cookies).json()

    member_cookies = {"hi_session": create_session_token({"profile_id": member["id"], "role": "member"})}
    co_cookies = {"hi_session": create_session_token({"profile_id": co_admin["id"], "role": "co_admin"})}
    disp_cookies = {"hi_session": create_session_token({"profile_id": display["id"], "role": "viewer"})}

    # Member uploads their own profile picture
    res = client.post(
        "/api/profiles/me/avatar",
        files={"file": ("avatar.png", _make_png_bytes(), "image/png")},
        cookies=member_cookies,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["avatar_url"].startswith(f"/api/profiles/{member['id']}/avatar?v=")
    first_avatar_url = body["avatar_url"]

    # Active avatar URL serves JPEG cleanly even without auth (used on household login picker)
    client.cookies.clear()
    img_res = client.get(first_avatar_url)
    assert img_res.status_code == 200
    assert img_res.headers["content-type"].startswith("image/jpeg")

    # Display profile cannot upload avatar
    disp_res = client.post(
        "/api/profiles/me/avatar",
        files={"file": ("avatar.png", _make_png_bytes(), "image/png")},
        cookies=disp_cookies,
    )
    assert disp_res.status_code == 403

    # Invalid file is rejected and preserves previous picture
    bad_res = client.post(
        "/api/profiles/me/avatar",
        files={"file": ("not_image.txt", b"hello", "text/plain")},
        cookies=member_cookies,
    )
    assert bad_res.status_code == 400
    assert client.get(first_avatar_url).status_code == 200

    # Replace via Co-Admin for member
    rep_res = client.post(
        f"/api/profiles/{member['id']}/avatar",
        files={"file": ("avatar2.png", _make_png_bytes((220, 40, 40, 255)), "image/png")},
        cookies=co_cookies,
    )
    assert rep_res.status_code == 200
    second_avatar_url = rep_res.json()["avatar_url"]
    assert second_avatar_url != first_avatar_url

    # Co-Admin cannot change Admin's avatar
    forbidden_res = client.post(
        "/api/profiles/1/avatar",
        files={"file": ("avatar.png", _make_png_bytes(), "image/png")},
        cookies=co_cookies,
    )
    assert forbidden_res.status_code == 403

    # Deactivated member avatar hidden unauthenticated, visible to admin
    client.put(f"/api/profiles/{member['id']}", json={"is_active": False}, cookies=admin_cookies)
    client.cookies.clear()
    assert client.get(second_avatar_url).status_code == 404
    assert client.get(second_avatar_url, cookies=admin_cookies).status_code == 200

    # Remove own avatar (re-activate member first)
    client.put(f"/api/profiles/{member['id']}", json={"is_active": True}, cookies=admin_cookies)
    del_res = client.delete("/api/profiles/me/avatar", cookies=member_cookies)
    assert del_res.status_code == 200
    assert del_res.json()["avatar_url"] is None
    assert client.get(second_avatar_url).status_code == 404


def test_delete_profile_permanently_with_guards_and_fk_cleanup(client, db_session):
    from backend.app.core.config import PHOTOS_DIR
    from backend.app.models import Category, Item

    admin_token = create_session_token({"profile_id": 1, "role": "admin"})
    admin_cookies = {"hi_session": admin_token}

    # Create second admin, co_admin, and member with avatar + loaned item
    admin2 = client.post("/api/profiles", json={"name": "Second Admin", "role": "admin"}, cookies=admin_cookies).json()
    co_admin = client.post("/api/profiles", json={"name": "CoAdmin", "role": "co_admin"}, cookies=admin_cookies).json()
    member = client.post("/api/profiles", json={"name": "Jordan", "role": "member"}, cookies=admin_cookies).json()

    up = client.post(
        f"/api/profiles/{member['id']}/avatar",
        files={"file": ("jordan.png", _make_png_bytes(), "image/png")},
        cookies=admin_cookies,
    )
    assert up.status_code == 200
    assert (PHOTOS_DIR / "profile" / str(member["id"])).exists()

    # Create category + item loaned out to member (taken_by unset to verify fallback name preservation)
    cat = Category(name="Tools", icon="build", color="#1976d2")
    db_session.add(cat)
    db_session.commit()
    item = Item(
        category_id=cat.id,
        name="Drill",
        taken_out=1,
        taken_out_quantity=1,
        taken_by_profile_id=member["id"],
        taken_by=None,
    )
    db_session.add(item)
    db_session.commit()

    # Non-admin cannot delete a profile
    co_cookies = {"hi_session": create_session_token({"profile_id": co_admin["id"], "role": "co_admin"})}
    assert client.delete(f"/api/profiles/{member['id']}", cookies=co_cookies).status_code == 403

    # Self-delete is blocked even when another active admin exists
    self_res = client.delete("/api/profiles/1", cookies=admin_cookies)
    assert self_res.status_code == 400
    assert "SELF_DELETE" in self_res.text

    # Admin permanently deletes Jordan
    del_res = client.delete(f"/api/profiles/{member['id']}", cookies=admin_cookies)
    assert del_res.status_code == 200
    assert db_session.query(Profile).filter(Profile.id == member["id"]).first() is None
    assert not (PHOTOS_DIR / "profile" / str(member["id"])).exists()

    # Loaned item survives with borrower display name preserved and FK cleared
    db_session.expire_all()
    refreshed_item = db_session.query(Item).filter(Item.id == item.id).first()
    assert refreshed_item is not None
    assert refreshed_item.taken_by_profile_id is None
    assert refreshed_item.taken_by == "Jordan"

    # Second admin can be deleted while Admin 1 remains
    assert client.delete(f"/api/profiles/{admin2['id']}", cookies=admin_cookies).status_code == 200

    # Last remaining active Admin still cannot be deleted
    last_res = client.delete("/api/profiles/1", cookies=admin_cookies)
    assert last_res.status_code == 400
    assert "LAST_ADMIN" in last_res.text


