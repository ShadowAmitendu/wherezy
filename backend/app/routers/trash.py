import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.config import DATA_DIR
from backend.app.core.db import get_db
from backend.app.models import Item, Location, Category, Photo, Attachment, Profile
from backend.app.schemas import TrashItemOut, TrashRestoreRequest, SuccessResponse
from backend.app.services.permissions import require
from backend.app.services.activity import record

router = APIRouter(prefix="/trash", tags=["Trash"])

PHOTOS_DIR = DATA_DIR / "photos"
FILES_DIR = DATA_DIR / "files"

@router.get("", response_model=List[TrashItemOut])
def list_trash(db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    """List deleted items, locations, and categories."""
    results: List[TrashItemOut] = []

    # Items
    items_q = db.query(Item).filter(Item.deleted_at.isnot(None))
    if current.role != "admin":
        items_q = items_q.filter(Item.deleted_by == current.id)
    for it in items_q.order_by(Item.deleted_at.desc()).all():
        deleter = db.query(Profile).filter(Profile.id == it.deleted_by).first() if it.deleted_by else None
        results.append(TrashItemOut(
            type="item",
            id=it.id,
            name=it.name,
            deleted_at=it.deleted_at,
            deleted_by=it.deleted_by,
            deleted_by_name=deleter.name if deleter else None,
            original_location_name=it.location.name if it.location else None
        ))

    # Locations (admin only)
    if current.role == "admin":
        for loc in db.query(Location).filter(Location.deleted_at.isnot(None)).order_by(Location.deleted_at.desc()).all():
            deleter = db.query(Profile).filter(Profile.id == loc.deleted_by).first() if loc.deleted_by else None
            results.append(TrashItemOut(
                type="location",
                id=loc.id,
                name=loc.name,
                deleted_at=loc.deleted_at,
                deleted_by=loc.deleted_by,
                deleted_by_name=deleter.name if deleter else None
            ))

        for cat in db.query(Category).filter(Category.deleted_at.isnot(None)).order_by(Category.deleted_at.desc()).all():
            deleter = db.query(Profile).filter(Profile.id == cat.deleted_by).first() if cat.deleted_by else None
            results.append(TrashItemOut(
                type="category",
                id=cat.id,
                name=cat.name,
                deleted_at=cat.deleted_at,
                deleted_by=cat.deleted_by,
                deleted_by_name=deleter.name if deleter else None
            ))

    return sorted(results, key=lambda x: x.deleted_at, reverse=True)

@router.post("/{item_type}/{target_id}/restore", response_model=SuccessResponse)
def restore_trash(
    item_type: str,
    target_id: int,
    payload: TrashRestoreRequest = TrashRestoreRequest(),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    if item_type == "item":
        item = db.query(Item).filter(Item.id == target_id, Item.deleted_at.isnot(None)).first()
        if not item:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found in trash"}})

        # Check if parent location is active or deleted
        if payload.new_location_id:
            loc = db.query(Location).filter(Location.id == payload.new_location_id, Location.deleted_at.is_(None)).first()
            if not loc:
                raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_LOCATION", "message": "Destination location not found"}})
            item.location_id = loc.id
        elif item.location_id:
            loc = db.query(Location).filter(Location.id == item.location_id, Location.deleted_at.is_(None)).first()
            if not loc:
                raise HTTPException(
                    status_code=400,
                    detail={"error": {"code": "LOCATION_DELETED", "message": "Original location was deleted. Please specify a new location."}}
                )

        item.deleted_at = None
        item.deleted_by = None
        db.commit()

        record(db, "item", "restored", f"Restored '{item.name}' from trash", entity_id=item.id, actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Restored '{item.name}'")

    elif item_type == "location":
        if current.role != "admin":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Admin required"}})
        loc = db.query(Location).filter(Location.id == target_id, Location.deleted_at.isnot(None)).first()
        if not loc:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found in trash"}})
        loc.deleted_at = None
        loc.deleted_by = None
        db.commit()

        record(db, "location", "restored", f"Restored location '{loc.name}' from trash", entity_id=loc.id, actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Restored location '{loc.name}'")

    elif item_type == "category":
        if current.role != "admin":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Admin required"}})
        cat = db.query(Category).filter(Category.id == target_id, Category.deleted_at.isnot(None)).first()
        if not cat:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Category not found in trash"}})
        cat.deleted_at = None
        cat.deleted_by = None
        db.commit()

        record(db, "category", "restored", f"Restored category '{cat.name}' from trash", entity_id=cat.id, actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Restored category '{cat.name}'")

    raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_TYPE", "message": f"Unknown type '{item_type}'"}})

@router.delete("/{item_type}/{target_id}", response_model=SuccessResponse)
def purge_trash_item(
    item_type: str,
    target_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    if item_type == "item":
        item = db.query(Item).filter(Item.id == target_id, Item.deleted_at.isnot(None)).first()
        if not item:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found in trash"}})

        # Clean attachments files
        att_dir = FILES_DIR / str(item.id)
        if att_dir.exists():
            shutil.rmtree(att_dir, ignore_errors=True)

        # Clean photos files
        for p in db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == item.id).all():
            try:
                (PHOTOS_DIR / p.file_name).unlink(missing_ok=True)
                (PHOTOS_DIR / p.thumb_name).unlink(missing_ok=True)
            except Exception:
                pass

        name = item.name
        db.delete(item)
        db.commit()

        record(db, "system", "purged", f"Permanently purged item '{name}'", actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Permanently purged item '{name}'")

    elif item_type == "location":
        loc = db.query(Location).filter(Location.id == target_id, Location.deleted_at.isnot(None)).first()
        if not loc:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found in trash"}})
        name = loc.name
        db.delete(loc)
        db.commit()
        record(db, "system", "purged", f"Permanently purged location '{name}'", actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Permanently purged location '{name}'")

    elif item_type == "category":
        cat = db.query(Category).filter(Category.id == target_id, Category.deleted_at.isnot(None)).first()
        if not cat:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Category not found in trash"}})
        name = cat.name
        db.delete(cat)
        db.commit()
        record(db, "system", "purged", f"Permanently purged category '{name}'", actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Permanently purged category '{name}'")

    raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_TYPE", "message": f"Unknown type '{item_type}'"}})

@router.post("/empty", response_model=SuccessResponse)
def empty_trash(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    trashed_items = db.query(Item).filter(Item.deleted_at.isnot(None)).all()
    count = len(trashed_items)
    for it in trashed_items:
        att_dir = FILES_DIR / str(it.id)
        if att_dir.exists():
            shutil.rmtree(att_dir, ignore_errors=True)
        db.delete(it)

    db.query(Location).filter(Location.deleted_at.isnot(None)).delete(synchronize_session=False)
    db.query(Category).filter(Category.deleted_at.isnot(None)).delete(synchronize_session=False)

    db.commit()
    record(db, "system", "trash_emptied", f"Emptied trash ({count} items purged)", actor=current)
    db.commit()
    return SuccessResponse(ok=True, message=f"Trash emptied ({count} items purged)")
