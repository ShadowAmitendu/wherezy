import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def create_test_image_bytes():
    file = io.BytesIO()
    image = Image.new("RGB", (200, 200), color="blue")
    image.save(file, format="JPEG")
    file.seek(0)
    return file

def test_photo_upload_and_admin_flow(client):
    # 1. Create an item to attach photo to
    cat_res = client.post("/api/categories", json={"name": "Media Cat Test"})
    cat_id = cat_res.json()["id"]

    item_res = client.post("/api/items", json={"name": "Camera Item", "category_id": cat_id})
    item_id = item_res.json()["id"]

    # 2. Upload photo
    img_bytes = create_test_image_bytes()
    res = client.post(
        "/api/photos",
        data={"owner_type": "item", "owner_id": item_id},
        files={"file": ("test.jpg", img_bytes, "image/jpeg")}
    )
    assert res.status_code == 200
    photo = res.json()
    photo_id = photo["id"]
    assert photo["is_cover"] is True

    # 3. Retrieve photo file and thumb
    res = client.get(f"/api/photos/{photo_id}/file")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"

    res = client.get(f"/api/photos/{photo_id}/thumb")
    assert res.status_code == 200

    # 4. Storage stats
    res = client.get("/api/admin/storage")
    assert res.status_code == 200
    stats = res.json()
    assert stats["db_bytes"] > 0
    assert stats["photos_bytes"] > 0

    # 5. Backup
    res = client.post("/api/admin/backup")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/zip"
    zip_bytes = io.BytesIO(res.content)

    # 6. Backups list
    res = client.get("/api/admin/backups")
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # 7. Restore
    zip_bytes.seek(0)
    res = client.post(
        "/api/admin/restore",
        files={"file": ("restore.zip", zip_bytes, "application/zip")}
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True

    # 8. Export CSV & JSON
    res = client.get("/api/admin/export?format=json")
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]

    res = client.get("/api/admin/export?format=csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
