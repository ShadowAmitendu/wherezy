import os
import uuid
from pathlib import Path
from typing import Tuple
from PIL import Image, ImageOps
from fastapi import HTTPException, UploadFile, status
from backend.app.core.config import PHOTOS_DIR

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
MAX_ORIGINAL_DIMENSION = 2000
THUMBNAIL_DIMENSION = 400

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}

def get_owner_photo_dir(owner_type: str, owner_id: int) -> Path:
    target_dir = PHOTOS_DIR / owner_type / str(owner_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir

def process_and_save_image(upload_file: UploadFile, owner_type: str, owner_id: int) -> Tuple[str, str, int, int, int]:
    """
    Validates, strips EXIF, corrects orientation, resizes original to <= 2000px,
    creates 400px thumb, and saves both to disk.
    Returns: (file_name, thumb_name, width, height, bytes)
    """
    content = upload_file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"error": {"code": "FILE_TOO_LARGE", "message": "Photo exceeds 15 MB limit"}}
        )

    import io
    try:
        img = Image.open(io.BytesIO(content))
        img_format = img.format
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_IMAGE", "message": "Uploaded file is not a valid or supported image"}}
        )

    if img_format not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "UNSUPPORTED_FORMAT", "message": f"Image format {img_format} is not supported"}}
        )

    # Correct orientation based on EXIF and strip EXIF
    try:
        img = ImageOps.exif_transpose(img)
    except (OSError, ValueError):
        # Malformed EXIF metadata should not block photo upload
        pass

    # Convert RGBA to RGB for JPEG saving if necessary
    if img.mode in ("RGBA", "P"):
        rgb_img = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            rgb_img.paste(img, mask=img.split()[3])
        else:
            rgb_img.paste(img)
        img = rgb_img
    elif img.mode != "RGB":
        img = img.convert("RGB")

    width, height = img.size

    # Resize original if larger than MAX_ORIGINAL_DIMENSION
    if max(width, height) > MAX_ORIGINAL_DIMENSION:
        img.thumbnail((MAX_ORIGINAL_DIMENSION, MAX_ORIGINAL_DIMENSION), Image.Resampling.LANCZOS)
        width, height = img.size

    target_dir = get_owner_photo_dir(owner_type, owner_id)
    random_id = uuid.uuid4().hex
    file_name = f"{random_id}.jpg"
    thumb_name = f"{random_id}_thumb.jpg"

    file_path = target_dir / file_name
    thumb_path = target_dir / thumb_name

    # Save original stripped of EXIF
    img.save(str(file_path), format="JPEG", quality=85, optimize=True)
    saved_bytes = os.path.getsize(str(file_path))

    # Save 400px thumbnail
    thumb_img = img.copy()
    thumb_img.thumbnail((THUMBNAIL_DIMENSION, THUMBNAIL_DIMENSION), Image.Resampling.LANCZOS)
    thumb_img.save(str(thumb_path), format="JPEG", quality=80, optimize=True)

    return file_name, thumb_name, width, height, saved_bytes

def delete_photo_files(owner_type: str, owner_id: int, file_name: str, thumb_name: str):
    owner_dir = PHOTOS_DIR / owner_type / str(owner_id)
    fp = owner_dir / file_name
    tp = owner_dir / thumb_name
    if fp.exists():
        try:
            fp.unlink()
        except OSError:
            pass
    if tp.exists():
        try:
            tp.unlink()
        except OSError:
            pass
