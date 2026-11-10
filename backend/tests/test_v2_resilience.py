import tempfile
from pathlib import Path
from backend.app.models import Profile, Category, Item
from backend.app.core.security import create_session_token

def test_wall_display_second_copy_and_offline(client, db_session):
    admin_token = create_session_token({"profile_id": 1, "role": "admin"})

    # 1. Wall Display with display profile
    disp = Profile(name="Wall Tablet", role="viewer", is_active=1, is_display=1)
    db_session.add(disp)
    db_session.commit()
    disp_token = create_session_token({"profile_id": disp.id, "role": "viewer"})

    # Display profile can access /api/wall
    res = client.get("/api/wall", cookies={"hi_session": disp_token})
    assert res.status_code == 200
    wall_data = res.json()
    assert "overdue" in wall_data
    assert "due_soon" in wall_data
    assert "taken_out" in wall_data

    # Display profile is FORBIDDEN from all other routes (even viewer reads)
    res = client.get("/api/items", cookies={"hi_session": disp_token})
    assert res.status_code == 403

    # 2. Second-Copy Backup
    with tempfile.TemporaryDirectory() as temp_backup_dir:
        res = client.put("/api/admin/second-copy", json={
            "enabled": True,
            "path": temp_backup_dir,
            "keep": 5
        }, cookies={"hi_session": admin_token})
        assert res.status_code == 200
        status_data = res.json()
        assert status_data["enabled"] is True
        assert status_data["path"] == temp_backup_dir

        # Test folder
        res = client.post("/api/admin/second-copy/test", cookies={"hi_session": admin_token})
        assert res.status_code == 200
        assert res.json()["ok"] is True

    # 3. Offline Mode Snapshot
    res = client.get("/api/offline/snapshot", cookies={"hi_session": admin_token})
    assert res.status_code == 200
    snap = res.json()
    assert snap["schema_version"] == 10
    assert "categories" in snap
    assert "items" in snap
    assert "locations" in snap
