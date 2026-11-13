import shutil
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.config import PHOTOS_DIR, FILES_DIR
from backend.app.core.db import get_db
from backend.app.models import Item, Location, Category, Photo, Profile
from backend.app.schemas import TrashItemOut, TrashRestoreRequest, SuccessResponse
from backend.app.services.permissions import require
from backend.app.services.activity import record
from backend.app.services.photo_service import delete_photo_files
from backend.app.services.location_service import validate_location_capacity

router = APIRouter(prefix="/trash", tags=["Trash"])

@router.get("", response_model=List[TrashItemOut])
def list_trash(db: Session = Depends(get_db), current: Profile = Depends(require("trash:read"))):
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
    current: Profile = Depends(require("trash:restore"))
):
    if item_type == "item":
        item = db.query(Item).filter(Item.id == target_id, Item.deleted_at.isnot(None)).first()
        if not item:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found in trash"}})

        cat = db.query(Category).filter(Category.id == item.category_id, Category.deleted_at.is_(None)).first()
        if not cat:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "CATEGORY_DELETED", "message": "Original category was deleted. Please restore the category first."}}
            )

        # Check if parent location is active or deleted
        target_loc_id = payload.new_location_id if payload.new_location_id else item.location_id
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

        if item.location_id:
            validate_location_capacity(db, item.location_id, additional_quantity=max(1, int(item.quantity or 1)))

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
        # If the former parent is gone or still in trash, promote cleanly to root on restore.
        if loc.parent_id is not None:
            parent = db.query(Location).filter(Location.id == loc.parent_id, Location.deleted_at.is_(None)).first()
            if not parent:
                loc.parent_id = None
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

def _cleanup_photos(db: Session, owner_type: str, owner_ids: List[int]) -> None:
    """Remove photo files from disk (both structured and legacy flat paths) and delete their metadata rows."""
    if not owner_ids:
        return
    photos = (
        db.query(Photo)
        .filter(Photo.owner_type == owner_type, Photo.owner_id.in_(owner_ids))
        .all()
    )
    for p in photos:
        delete_photo_files(p.owner_type, p.owner_id, p.file_name, p.thumb_name)
        for legacy_name in (p.file_name, p.thumb_name):
            if legacy_name:
                (PHOTOS_DIR / Path(legacy_name).name).unlink(missing_ok=True)
    for oid in owner_ids:
        owner_dir = PHOTOS_DIR / owner_type / str(oid)
        if owner_dir.exists() and owner_dir.is_dir():
            try:
                if not any(owner_dir.iterdir()):
                    owner_dir.rmdir()
            except OSError:
                pass
    if photos:
        db.query(Photo).filter(
            Photo.owner_type == owner_type, Photo.owner_id.in_(owner_ids)
        ).delete(synchronize_session=False)


def _purge_items(db: Session, items: List[Item]) -> None:
    """Permanently delete items along with attachments and photo assets."""
    if not items:
        return
    item_ids = [it.id for it in items]
    for it in items:
        att_dir = FILES_DIR / str(it.id)
        if att_dir.exists():
            shutil.rmtree(att_dir, ignore_errors=True)
    _cleanup_photos(db, "item", item_ids)
    for it in items:
        db.delete(it)
    # Flush item deletions before purging locations/categories because SessionLocal uses autoflush=False
    # and items.location_id / items.category_id enforce ON DELETE RESTRICT.
    db.flush()


def _purge_locations(db: Session, location_ids: List[int]) -> None:
    """Permanently delete locations after detaching nullable item and parent-location foreign keys."""
    if not location_ids:
        return
    _cleanup_photos(db, "location", location_ids)
    db.query(Item).filter(Item.location_id.in_(location_ids)).update(
        {Item.location_id: None}, synchronize_session=False
    )
    db.query(Location).filter(Location.parent_id.in_(location_ids)).update(
        {Location.parent_id: None}, synchronize_session=False
    )
    db.flush()
    db.query(Location).filter(Location.id.in_(location_ids)).delete(synchronize_session=False)


def _purge_categories(db: Session, category_ids: List[int]) -> None:
    """Permanently delete categories when no remaining items reference them."""
    if not category_ids:
        return
    blocking = (
        db.query(Category.name)
        .join(Item, Item.category_id == Category.id)
        .filter(Category.id.in_(category_ids))
        .distinct()
        .all()
    )
    if blocking:
        names = ", ".join(f"'{name}'" for (name,) in blocking)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "CATEGORY_IN_USE",
                    "message": f"Cannot permanently delete category {names} while items still reference it. Restore or reassign those items first.",
                }
            },
        )
    db.query(Category).filter(Category.id.in_(category_ids)).delete(synchronize_session=False)


@router.delete("/{item_type}/{target_id}", response_model=SuccessResponse)
def purge_trash_item(
    item_type: str,
    target_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("trash:purge"))
):
    if item_type == "item":
        item = db.query(Item).filter(Item.id == target_id, Item.deleted_at.isnot(None)).first()
        if not item:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found in trash"}})

        name = item.name
        _purge_items(db, [item])
        db.commit()

        record(db, "system", "purged", f"Permanently purged item '{name}'", actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Permanently purged item '{name}'")

    elif item_type == "location":
        loc = db.query(Location).filter(Location.id == target_id, Location.deleted_at.isnot(None)).first()
        if not loc:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found in trash"}})
        name = loc.name
        _purge_locations(db, [loc.id])
        db.commit()
        record(db, "system", "purged", f"Permanently purged location '{name}'", actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Permanently purged location '{name}'")

    elif item_type == "category":
        cat = db.query(Category).filter(Category.id == target_id, Category.deleted_at.isnot(None)).first()
        if not cat:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Category not found in trash"}})
        name = cat.name
        _purge_categories(db, [cat.id])
        db.commit()
        record(db, "system", "purged", f"Permanently purged category '{name}'", actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Permanently purged category '{name}'")

    raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_TYPE", "message": f"Unknown type '{item_type}'"}})

@router.post("/empty", response_model=SuccessResponse)
def empty_trash(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("trash:purge"))
):
    trashed_items = db.query(Item).filter(Item.deleted_at.isnot(None)).all()
    trashed_loc_ids = [loc_id for (loc_id,) in db.query(Location.id).filter(Location.deleted_at.isnot(None)).all()]
    trashed_cat_ids = [cat_id for (cat_id,) in db.query(Category.id).filter(Category.deleted_at.isnot(None)).all()]

    items_count = len(trashed_items)
    locs_count = len(trashed_loc_ids)
    cats_count = len(trashed_cat_ids)

    _purge_items(db, trashed_items)
    _purge_locations(db, trashed_loc_ids)
    _purge_categories(db, trashed_cat_ids)

    db.commit()
    summary = f"Emptied trash ({items_count} items, {locs_count} locations, {cats_count} categories purged)"
    record(db, "system", "trash_emptied", summary, actor=current)
    db.commit()
    return SuccessResponse(ok=True, message=f"Trash emptied ({items_count} items, {locs_count} locations, {cats_count} categories purged)")
