import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from backend.app.services.permissions import require, get_current_profile, ROLE_LEVELS, PERMISSIONS
from backend.app.core.security import create_session_token
from backend.app.models import Profile

def test_permissions_hierarchy():
    assert ROLE_LEVELS["admin"] > ROLE_LEVELS["member"]
    assert ROLE_LEVELS["member"] > ROLE_LEVELS["viewer"]

def test_permissions_service_with_app(client, db_session):
    # Setup test profiles (Admin with PIN to enforce profile auth requirement)
    admin = Profile(name="TestAdmin", role="admin", is_active=1, pin_hash="fakehash")
    member = Profile(name="TestMember", role="member", is_active=1)
    viewer = Profile(name="TestViewer", role="viewer", is_active=1)
    display = Profile(name="TestDisplay", role="viewer", is_active=1, is_display=1)
    inactive = Profile(name="TestInactive", role="admin", is_active=0)

    db_session.add_all([admin, member, viewer, display, inactive])
    db_session.commit()

    test_app = FastAPI()

    @test_app.get("/viewer-only")
    def viewer_endpoint(prof: Profile = Depends(require("viewer"))):
        return {"profile": prof.name, "role": prof.role}

    @test_app.get("/member-only")
    def member_endpoint(prof: Profile = Depends(require("member"))):
        return {"profile": prof.name, "role": prof.role}

    @test_app.get("/admin-only")
    def admin_endpoint(prof: Profile = Depends(require("admin"))):
        return {"profile": prof.name, "role": prof.role}

    @test_app.get("/wall-endpoint")
    def wall_endpoint(prof: Profile = Depends(require("wall:read"))):
        return {"wall": "ok"}

    @test_app.get("/profiles/me")
    def me_endpoint(prof: Profile = Depends(require("viewer"))):
        return {"id": prof.id, "name": prof.name}

    tc = TestClient(test_app)

    # 1. Unauthenticated request -> 401
    res = tc.get("/viewer-only")
    assert res.status_code == 401

    # 2. Inactive profile -> 401
    inact_token = create_session_token({"profile_id": inactive.id})
    res = tc.get("/viewer-only", cookies={"hi_session": inact_token})
    assert res.status_code == 401

    # 3. Viewer access
    viewer_token = create_session_token({"profile_id": viewer.id})
    res = tc.get("/viewer-only", cookies={"hi_session": viewer_token})
    assert res.status_code == 200
    assert res.json()["role"] == "viewer"

    # Viewer accessing member endpoint -> 403
    res = tc.get("/member-only", cookies={"hi_session": viewer_token})
    assert res.status_code == 403

    # Viewer accessing admin endpoint -> 403
    res = tc.get("/admin-only", cookies={"hi_session": viewer_token})
    assert res.status_code == 403

    # 4. Member access
    member_token = create_session_token({"profile_id": member.id})
    res = tc.get("/viewer-only", cookies={"hi_session": member_token})
    assert res.status_code == 200
    res = tc.get("/member-only", cookies={"hi_session": member_token})
    assert res.status_code == 200
    res = tc.get("/admin-only", cookies={"hi_session": member_token})
    assert res.status_code == 403

    # 5. Admin access
    admin_token = create_session_token({"profile_id": admin.id})
    res = tc.get("/viewer-only", cookies={"hi_session": admin_token})
    assert res.status_code == 200
    res = tc.get("/member-only", cookies={"hi_session": admin_token})
    assert res.status_code == 200
    res = tc.get("/admin-only", cookies={"hi_session": admin_token})
    assert res.status_code == 200

    # 6. Display profile restrictions: ONLY wall:read and GET /profiles/me allowed!
    disp_token = create_session_token({"profile_id": display.id})
    res = tc.get("/wall-endpoint", cookies={"hi_session": disp_token})
    assert res.status_code == 200
    res = tc.get("/profiles/me", cookies={"hi_session": disp_token})
    assert res.status_code == 200
    # Any other route (even viewer read) -> 403!
    res = tc.get("/viewer-only", cookies={"hi_session": disp_token})
    assert res.status_code == 403
