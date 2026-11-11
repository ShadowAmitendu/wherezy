def test_auth_status_initially(client):
    res = client.get("/api/auth/status")
    assert res.status_code == 200
    data = res.json()
    assert "pin_set" in data
    assert "authenticated" in data

def test_settings_crud(client):
    # Get settings
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert data["expiry_warn_days"] >= 1
    assert "theme" in data

    # Update settings
    res = client.put("/api/settings", json={"expiry_warn_days": 45, "theme": "dark"})
    assert res.status_code == 200
    updated = res.json()
    assert updated["expiry_warn_days"] == 45
    assert updated["theme"] == "dark"

    # Reset
    client.put("/api/settings", json={"expiry_warn_days": 30, "theme": "system"})
