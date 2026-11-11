import io
import json
import zipfile
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import DATA_DIR, FILES_DIR
from backend.app.core.security import create_session_token, hash_pin
from backend.app.models import Category, Item, Profile


def test_x_profile_id_header_ignored(client, db_session):
    """Forged X-Profile-ID headers must never bypass authentication or elevate privileges."""
    unauth = TestClient(app)
    res = unauth.get("/api/settings", headers={"X-Profile-ID": "1"})
    assert res.status_code == 401

    viewer = Profile(name="AuditViewer", username="auditviewer", role="viewer", is_active=1)
    db_session.add(viewer)
    db_session.commit()

    viewer_client = TestClient(app)
    viewer_client.cookies.set("hi_session", create_session_token({"profile_id": viewer.id, "role": "viewer"}))
    res = viewer_client.get("/api/admin/storage", headers={"X-Profile-ID": "1"})
    assert res.status_code == 403


def test_unauthenticated_endpoints_return_401(client):
    """Protected routers must reject unauthenticated callers with 401."""
    unauth = TestClient(app)
    protected = [
        ("GET", "/api/admin/storage"),
        ("GET", "/api/settings"),
        ("GET", "/api/photos/1/file"),
        ("GET", "/api/categories"),
        ("GET", "/api/categories/1/fields"),
        ("GET", "/api/templates"),
        ("GET", "/api/items"),
        ("GET", "/api/items/1"),
        ("GET", "/api/locations/tree"),
        ("GET", "/api/locations/1"),
        ("GET", "/api/locations/1/items"),
        ("GET", "/api/dashboard"),
        ("GET", "/api/codes/resolve?code=test"),
    ]
    for method, path in protected:
        res = unauth.request(method, path)
        assert res.status_code == 401, f"{method} {path} returned {res.status_code}"


def test_health_endpoint_redacts_counts_unauthenticated(client):
    """GET /api/health returns only liveness unauthenticated, and counts when authenticated."""
    unauth = TestClient(app)
    res_unauth = unauth.get("/api/health")
    assert res_unauth.status_code == 200
    body_unauth = res_unauth.json()
    assert set(body_unauth.keys()) == {"status", "time"}
    assert body_unauth["status"] == "ok"

    res_auth = client.get("/api/health")
    assert res_auth.status_code == 200
    body_auth = res_auth.json()
    for key in ("no_location", "no_photo", "long_expired", "duplicates", "stale_inbox"):
        assert key in body_auth


def test_custom_role_no_prefix_escalation_and_aliases(client, db_session):
    """Custom role 'items:read' must not escalate to 'items:write'/'items:delete'; aliases work."""
    cat = Category(name="SecCat", icon="tag", color="#333")
    db_session.add(cat)
    db_session.commit()
    item = Item(name="SecItem", category_id=cat.id, status="active")
    db_session.add(item)
    custom_prof = Profile(
        name="ScopedUser",
        username="scopeduser",
        role="custom",
        custom_permissions_json=json.dumps(["items:read", "export:read"]),
        is_active=1,
    )
    db_session.add(custom_prof)
    db_session.commit()

    c = TestClient(app)
    c.cookies.set("hi_session", create_session_token({"profile_id": custom_prof.id, "role": "custom"}))

    assert c.get("/api/items").status_code == 200
    assert c.get("/api/admin/export?format=json").status_code == 200
    assert c.post("/api/items", json={"name": "Nope", "category_id": cat.id}).status_code == 403
    assert c.delete(f"/api/items/{item.id}").status_code == 403
    assert c.get("/api/admin/storage").status_code == 403


def test_update_password_and_change_pin_require_current_secret(client, db_session):
    """Password/PIN changes must verify current secret when already configured."""
    user = Profile(
        name="PwdUser",
        username="pwduser",
        role="member",
        pin_hash=hash_pin("old-secret"),
        must_change_password=0,
        is_active=1,
    )
    db_session.add(user)
    db_session.commit()

    c = TestClient(app)
    c.cookies.set("hi_session", create_session_token({"profile_id": user.id, "role": "member"}))

    # Missing or wrong current_password rejected
    res = c.post("/api/auth/update-password", json={"new_password": "new-secret"})
    assert res.status_code == 401
    res = c.post("/api/auth/update-password", json={"current_password": "wrong", "new_password": "new-secret"})
    assert res.status_code == 401

    # Correct current_password accepted
    res = c.post("/api/auth/update-password", json={"current_password": "old-secret", "new_password": "new-secret"})
    assert res.status_code == 200

    # Wrong current_pin rejected for change-pin
    res = c.post("/api/auth/change-pin", json={"current_pin": "old-secret", "new_pin": "1234"})
    assert res.status_code == 401

    # Updated secret accepted for change-pin
    res = c.post("/api/auth/change-pin", json={"current_pin": "new-secret", "new_pin": "1234"})
    assert res.status_code == 200


def test_backup_zip_slip_rejected_and_files_backslash_restored(client):
    """Restore rejects path traversal entries and safely restores files/ with backslash names."""
    # Create malicious zip containing path traversal
    bad_zip = io.BytesIO()
    with zipfile.ZipFile(bad_zip, "w") as zf:
        zf.writestr("../evil.txt", "pwned")
    bad_zip.seek(0)
    res = client.post("/api/admin/restore", files={"file": ("evil.zip", bad_zip, "application/zip")})
    assert res.status_code == 400
    assert "INVALID_ZIP" in res.text
    assert not (DATA_DIR.parent / "evil.txt").exists()

    # Take a valid backup to obtain a passing inventory.db payload, then repack with files\999\doc.txt
    backup_res = client.post("/api/admin/backup")
    assert backup_res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(backup_res.content), "r") as src_zf:
        db_bytes = src_zf.read("inventory.db")

    repacked = io.BytesIO()
    with zipfile.ZipFile(repacked, "w") as dst_zf:
        dst_zf.writestr("inventory.db", db_bytes)
        dst_zf.writestr("files\\999\\doc.txt", "restored-attachment-content")
    repacked.seek(0)

    res = client.post("/api/admin/restore", files={"file": ("ok.zip", repacked, "application/zip")})
    assert res.status_code == 200
    restored_file = FILES_DIR / "999" / "doc.txt"
    assert restored_file.exists()
    assert restored_file.read_text(encoding="utf-8") == "restored-attachment-content"


def test_api_404_and_removed_saved_filters(client):
    """Unknown /api routes and removed /api/saved-filters return 404 (not SPA HTML)."""
    for path in ("/api/nonexistent-endpoint", "/api/saved-filters"):
        res = client.get(path)
        assert res.status_code == 404
