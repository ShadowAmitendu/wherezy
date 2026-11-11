from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.core.config import PHOTOS_DIR
from backend.app.models import Photo, Item, Location, Profile
from backend.app.schemas import PhotoOut, PhotoReorderRequest, SuccessResponse
from backend.app.services.photo_service import process_and_save_image, delete_photo_files
from backend.app.services.permissions import require
from backend.app.routers.settings import get_setting_val

router = APIRouter(prefix="/photos", tags=["Photos"])


def _resolve_photo_path(owner_type: str, owner_id: int, file_name: str) -> Path:
    """Resolve photo file safely inside PHOTOS_DIR, with legacy flat-inbox fallback."""
    base_dir = PHOTOS_DIR.resolve()
    scoped = (PHOTOS_DIR / owner_type / str(owner_id) / file_name).resolve()
    if scoped.is_relative_to(base_dir) and scoped.exists():
        return scoped
    legacy_flat = (PHOTOS_DIR / file_name).resolve()
    if legacy_flat.is_relative_to(base_dir) and legacy_flat.exists():
        return legacy_flat
    raise HTTPException(status_code=404, detail="Photo file not found on disk")

def map_photo(p: Photo) -> PhotoOut:
    return PhotoOut(
        id=p.id,
        owner_type=p.owner_type,
        owner_id=p.owner_id,
        file_name=p.file_name,
        thumb_name=p.thumb_name,
        width=p.width,
        height=p.height,
        bytes=p.bytes,
        is_cover=bool(p.is_cover),
        sort_order=p.sort_order,
        created_at=p.created_at,
        url=f"/api/photos/{p.id}/file",
        thumb_url=f"/api/photos/{p.id}/thumb"
    )

@router.post("", response_model=PhotoOut)
def upload_photo(
    owner_type: str = Form(...),
    owner_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("photos:write"))
):
    if owner_type not in ("item", "location"):
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_OWNER_TYPE", "message": "Owner must be 'item' or 'location'"}})

    # Validate owner exists
    if owner_type == "item":
        owner = db.query(Item).filter(Item.id == owner_id, Item.deleted_at.is_(None)).first()
    else:
        owner = db.query(Location).filter(Location.id == owner_id, Location.deleted_at.is_(None)).first()

    if not owner:
        raise HTTPException(status_code=404, detail={"error": {"code": "OWNER_NOT_FOUND", "message": f"{owner_type.capitalize()} not found"}})

    # Check photo limit per owner
    photo_limit = get_setting_val(db, "photo_limit_per_owner", 10)
    current_count = db.query(Photo).filter(Photo.owner_type == owner_type, Photo.owner_id == owner_id).count()
    if current_count >= photo_limit:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "PHOTO_LIMIT_EXCEEDED", "message": f"Maximum {photo_limit} photos allowed per {owner_type}"}}
        )

    file_name, thumb_name, width, height, saved_bytes = process_and_save_image(file, owner_type, owner_id)

    max_sort = db.query(func.max(Photo.sort_order)).filter(Photo.owner_type == owner_type, Photo.owner_id == owner_id).scalar() or 0
    is_cover = 1 if current_count == 0 else 0

    photo = Photo(
        owner_type=owner_type,
        owner_id=owner_id,
        file_name=file_name,
        thumb_name=thumb_name,
        width=width,
        height=height,
        bytes=saved_bytes,
        is_cover=is_cover,
        sort_order=max_sort + 1
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return map_photo(photo)

@router.get("/{id}/file")
def get_photo_file(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    photo = db.query(Photo).filter(Photo.id == id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    file_path = _resolve_photo_path(photo.owner_type, photo.owner_id, photo.file_name)
    return FileResponse(str(file_path), media_type="image/jpeg")

@router.get("/{id}/thumb")
def get_photo_thumb(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    photo = db.query(Photo).filter(Photo.id == id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    try:
        thumb_path = _resolve_photo_path(photo.owner_type, photo.owner_id, photo.thumb_name)
    except HTTPException:
        thumb_path = _resolve_photo_path(photo.owner_type, photo.owner_id, photo.file_name)
    return FileResponse(str(thumb_path), media_type="image/jpeg")

@router.put("/{id}/cover", response_model=PhotoOut)
def set_cover_photo(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("photos:write"))
):
    photo = db.query(Photo).filter(Photo.id == id).first()
    if not photo:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Photo not found"}})

    # Reset all photos for this owner
    db.query(Photo).filter(Photo.owner_type == photo.owner_type, Photo.owner_id == photo.owner_id).update({"is_cover": 0})
    photo.is_cover = 1
    db.commit()
    db.refresh(photo)
    return map_photo(photo)

@router.post("/reorder", response_model=SuccessResponse)
def reorder_photos(
    payload: PhotoReorderRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("photos:write"))
):
    for order, p_id in enumerate(payload.photo_ids, start=1):
        db.query(Photo).filter(Photo.id == p_id).update({"sort_order": order})
    db.commit()
    return SuccessResponse(ok=True, message="Photos reordered")

@router.delete("/{id}", response_model=SuccessResponse)
def delete_photo(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("photos:write"))
):
    photo = db.query(Photo).filter(Photo.id == id).first()
    if not photo:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Photo not found"}})

    delete_photo_files(photo.owner_type, photo.owner_id, photo.file_name, photo.thumb_name)
    was_cover = photo.is_cover
    owner_type = photo.owner_type
    owner_id = photo.owner_id

    db.delete(photo)
    db.commit()

    # If deleted photo was cover, pick the next photo as cover
    if was_cover:
        next_photo = db.query(Photo).filter(
            Photo.owner_type == owner_type,
            Photo.owner_id == owner_id
        ).order_by(Photo.sort_order).first()
        if next_photo:
            next_photo.is_cover = 1
            db.commit()

    return SuccessResponse(ok=True, message="Photo deleted")
