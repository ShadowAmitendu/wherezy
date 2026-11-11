import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Item, Category, Location, Photo, ItemTag, Profile
from backend.app.schemas import (
    InboxItemOut, InboxSortRequest, InboxUnsortRequest, InboxBulkRequest, SuccessResponse, PhotoOut
)
from backend.app.services.permissions import require
from backend.app.services.activity import record
from backend.app.services.photo_service import process_and_save_image

router = APIRouter(prefix="/inbox", tags=["Inbox & Capture"])

def _get_placeholder_category_id(db: Session) -> int:
    cat = db.query(Category).filter(Category.name == "__inbox_unsorted__").first()
    if cat:
        return cat.id
    # Fallback to any active category
    first = db.query(Category).first()
    if first:
        return first.id
    new_cat = Category(name="__inbox_unsorted__", icon="inbox", color="#9e9e9e")
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return new_cat.id

def _to_photo_out(p: Photo) -> PhotoOut:
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
        thumb_url=f"/api/photos/{p.id}/thumb",
    )

def _validate_location_id(db: Session, location_id: Optional[int]) -> Optional[int]:
    if location_id is None or location_id == 0:
        return None
    loc = db.query(Location).filter(Location.id == location_id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "LOCATION_NOT_FOUND", "message": "Location not found"}})
    return loc.id

@router.post("", response_model=InboxItemOut)
async def quick_capture(
    photos: List[UploadFile] = File(...),
    name: Optional[str] = Form(None),
    location_id: Optional[int] = Form(None),
    quantity: int = Form(1),
    client_id: Optional[str] = Form(None),
    attach_to: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("inbox:write"))
):
    if quantity < 1:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": "Quantity must be at least 1"}})
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    now_human = now_dt.strftime("%Y-%m-%d %H:%M")

    # If attaching to previous inbox item
    item = None
    created_new = False
    if attach_to:
        item = db.query(Item).filter(
            Item.id == attach_to,
            Item.status == "inbox",
            Item.deleted_at.is_(None),
        ).first()
        if not item:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Inbox item not found"}})

    if not item:
        validated_loc_id = _validate_location_id(db, location_id)
        cat_id = _get_placeholder_category_id(db)
        item_name = name.strip() if name and name.strip() else f"Untitled {now_human}"
        item = Item(
            name=item_name,
            category_id=cat_id,
            location_id=validated_loc_id,
            quantity=quantity,
            taken_out=0,
            taken_out_quantity=0,
            status="inbox",
            captured_at=now_iso,
        )
        db.add(item)
        db.flush()
        created_new = True

    existing_count = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == item.id).count()
    saved_count = 0
    for f in photos:
        f.file.seek(0, 2)
        size = f.file.tell()
        f.file.seek(0)
        if size == 0:
            continue

        file_name, thumb_name, w, h, saved_bytes = process_and_save_image(f, "item", item.id)
        photo = Photo(
            owner_type="item",
            owner_id=item.id,
            file_name=file_name,
            thumb_name=thumb_name,
            width=w,
            height=h,
            bytes=saved_bytes,
            is_cover=1 if (existing_count == 0 and saved_count == 0) else 0,
        )
        db.add(photo)
        saved_count += 1

    if created_new:
        record(db, "item", "captured", f"Captured photo to inbox: '{item.name}'", entity_id=item.id, actor=current)
    db.commit()
    db.refresh(item)

    all_photos = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == item.id).all()
    p_outs = [_to_photo_out(p) for p in all_photos]

    return InboxItemOut(
        id=item.id,
        name=item.name,
        quantity=max(1, int(item.quantity or 1)),
        captured_at=item.captured_at,
        photos=p_outs,
        location_id=item.location_id,
        location_name=item.location.name if item.location else None
    )

@router.get("", response_model=List[InboxItemOut])
def list_inbox_items(db: Session = Depends(get_db), current: Profile = Depends(require("items:read"))):
    """List items currently sitting in inbox."""
    items = db.query(Item).filter(Item.status == "inbox", Item.deleted_at.is_(None)).order_by(Item.id.desc()).all()
    item_ids = [it.id for it in items]
    photos_by_item: dict[int, list[PhotoOut]] = {}
    if item_ids:
        photos = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id.in_(item_ids)).all()
        for p in photos:
            photos_by_item.setdefault(p.owner_id, []).append(_to_photo_out(p))

    return [
        InboxItemOut(
            id=it.id,
            name=it.name,
            quantity=max(1, int(it.quantity or 1)),
            captured_at=it.captured_at,
            photos=photos_by_item.get(it.id, []),
            location_id=it.location_id,
            location_name=it.location.name if it.location else None
        )
        for it in items
    ]

@router.post("/{item_id}/sort", response_model=SuccessResponse)
def sort_inbox_item(
    item_id: int,
    payload: InboxSortRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("inbox:write"))
):
    """Sort an inbox item into active inventory."""
    item = db.query(Item).filter(
        Item.id == item_id,
        Item.status == "inbox",
        Item.deleted_at.is_(None),
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Inbox item not found"}})

    cat = db.query(Category).filter(Category.id == payload.category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_CATEGORY", "message": "Category not found"}})

    validated_loc_id = _validate_location_id(db, payload.location_id)

    item.name = payload.name.strip()
    item.category_id = cat.id
    item.location_id = validated_loc_id
    if payload.quantity is not None:
        item.quantity = payload.quantity
    item.values_json = json.dumps(payload.values or {})
    item.notes = payload.notes
    item.expiry_date = payload.expiry_date
    item.status = "active"

    if payload.tag_ids:
        db.query(ItemTag).filter(ItemTag.item_id == item.id).delete()
        for tid in payload.tag_ids[:20]:
            db.add(ItemTag(item_id=item.id, tag_id=tid))

    db.commit()

    record(
        db, "item", "sorted",
        f"Sorted inbox item into '{cat.name}': '{item.name}'",
        entity_id=item.id, actor=current,
        diff={"status": ["inbox", "active"], "category_id": [None, cat.id]}
    )
    db.commit()

    return SuccessResponse(ok=True, message=f"Item '{item.name}' sorted into inventory")

@router.post("/{item_id}/unsort", response_model=SuccessResponse)
def unsort_inbox_item(
    item_id: int,
    payload: InboxUnsortRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("inbox:write"))
):
    """Return a recently sorted active item back to the capture inbox."""
    item = db.query(Item).filter(
        Item.id == item_id,
        Item.status == "active",
        Item.deleted_at.is_(None),
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Sorted item not found"}})

    validated_loc_id = _validate_location_id(db, payload.location_id)
    item.name = payload.name.strip() or item.name
    item.category_id = _get_placeholder_category_id(db)
    item.location_id = validated_loc_id
    if payload.quantity is not None:
        item.quantity = payload.quantity
    item.values_json = json.dumps(payload.values or {})
    item.notes = payload.notes
    item.expiry_date = payload.expiry_date
    item.status = "inbox"
    db.query(ItemTag).filter(ItemTag.item_id == item.id).delete()
    db.commit()

    record(
        db, "item", "unsorted",
        f"Returned '{item.name}' back to capture inbox",
        entity_id=item.id, actor=current,
    )
    db.commit()
    return SuccessResponse(ok=True, message=f"Returned '{item.name}' to inbox")

@router.post("/bulk", response_model=SuccessResponse)
def bulk_inbox_action(
    payload: InboxBulkRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("inbox:write"))
):
    validated_loc_id = None
    if payload.action == "set_location":
        validated_loc_id = _validate_location_id(db, payload.params.get("location_id"))
    elif payload.action == "set_category":
        cat_id = payload.params.get("category_id")
        if cat_id:
            cat = db.query(Category).filter(Category.id == cat_id, Category.deleted_at.is_(None)).first()
            if not cat:
                raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_CATEGORY", "message": "Category not found"}})

    items = db.query(Item).filter(
        Item.id.in_(payload.ids),
        Item.status == "inbox",
        Item.deleted_at.is_(None),
    ).all()
    count = 0
    for it in items:
        if payload.action == "set_location":
            it.location_id = validated_loc_id
            count += 1
        elif payload.action == "set_category":
            cat_id = payload.params.get("category_id")
            if cat_id:
                it.category_id = cat_id
                it.status = "active"
                count += 1
        elif payload.action == "add_tags":
            tag_ids = payload.params.get("tag_ids", [])
            for tid in tag_ids:
                db.add(ItemTag(item_id=it.id, tag_id=tid))
            count += 1
        elif payload.action == "discard":
            it.deleted_at = datetime.now(timezone.utc).isoformat()
            it.deleted_by = current.id
            count += 1

    db.commit()
    record(db, "system", "inbox_bulk", f"Bulk inbox action '{payload.action}' on {count} items", actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Updated {count} inbox items")

@router.delete("/{item_id}", response_model=SuccessResponse)
def delete_inbox_item(
    item_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("inbox:write"))
):
    item = db.query(Item).filter(
        Item.id == item_id,
        Item.status == "inbox",
        Item.deleted_at.is_(None),
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Inbox item not found"}})

    item.deleted_at = datetime.now(timezone.utc).isoformat()
    item.deleted_by = current.id
    db.commit()

    record(db, "item", "deleted", f"Discarded inbox item '{item.name}'", entity_id=item.id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message="Inbox item discarded to trash")
