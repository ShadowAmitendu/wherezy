import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from backend.app.core.config import DATA_DIR
from backend.app.core.db import get_db
from backend.app.models import Item, Category, Location, Photo, ItemTag, Tag, Profile
from backend.app.schemas import (
    InboxItemOut, InboxSortRequest, InboxBulkRequest, ItemOut, SuccessResponse, PhotoOut
)
from backend.app.services.permissions import require
from backend.app.services.activity import record
from PIL import Image

router = APIRouter(prefix="/inbox", tags=["Inbox & Capture"])

PHOTOS_DIR = DATA_DIR / "photos"
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

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

@router.post("", response_model=InboxItemOut)
async def quick_capture(
    photos: List[UploadFile] = File(...),
    name: Optional[str] = Form(None),
    location_id: Optional[int] = Form(None),
    client_id: Optional[str] = Form(None),
    attach_to: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    now_human = now_dt.strftime("%Y-%m-%d %H:%M")

    # If attaching to previous inbox item
    item = None
    if attach_to:
        item = db.query(Item).filter(Item.id == attach_to, Item.status == "inbox").first()

    if not item:
        cat_id = _get_placeholder_category_id(db)
        item_name = name.strip() if name and name.strip() else f"Untitled {now_human}"
        item = Item(
            name=item_name,
            category_id=cat_id,
            location_id=location_id,
            status="inbox",
            captured_at=now_iso,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        record(db, "item", "captured", f"Captured photo to inbox: '{item.name}'", entity_id=item.id, actor=current)
        db.commit()

    # Save photos
    saved_photos = []
    for f in photos:
        content = await f.read()
        if not content:
            continue
        photo_id_str = str(uuid.uuid4())
        fname = f"{photo_id_str}.jpg"
        tname = f"{photo_id_str}_thumb.jpg"
        fpath = PHOTOS_DIR / fname
        tpath = PHOTOS_DIR / tname

        with open(fpath, "wb") as out:
            out.write(content)

        # Generate thumbnail
        try:
            with Image.open(fpath) as img:
                w, h = img.size
                img.thumbnail((300, 300))
                img.save(tpath, "JPEG", quality=85)
        except Exception:
            w, h = 0, 0
            with open(tpath, "wb") as out:
                out.write(content)

        photo = Photo(
            owner_type="item",
            owner_id=item.id,
            file_name=fname,
            thumb_name=tname,
            width=w,
            height=h,
            bytes=len(content),
            is_cover=1 if len(saved_photos) == 0 else 0
        )
        db.add(photo)
        saved_photos.append(photo)

    db.commit()

    # Build response
    all_photos = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == item.id).all()
    p_outs = [
        PhotoOut(
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
        for p in all_photos
    ]

    return InboxItemOut(
        id=item.id,
        name=item.name,
        captured_at=item.captured_at,
        photos=p_outs,
        location_id=item.location_id,
        location_name=item.location.name if item.location else None
    )

@router.get("", response_model=List[InboxItemOut])
def list_inbox_items(db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    """List items currently sitting in inbox."""
    items = db.query(Item).filter(Item.status == "inbox", Item.deleted_at.is_(None)).order_by(Item.id.desc()).all()
    results = []
    for it in items:
        photos = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == it.id).all()
        p_outs = [
            PhotoOut(
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
            for p in photos
        ]
        results.append(InboxItemOut(
            id=it.id,
            name=it.name,
            captured_at=it.captured_at,
            photos=p_outs,
            location_id=it.location_id,
            location_name=it.location.name if it.location else None
        ))
    return results

@router.post("/{item_id}/sort", response_model=SuccessResponse)
def sort_inbox_item(
    item_id: int,
    payload: InboxSortRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    """Sort an inbox item into active inventory."""
    item = db.query(Item).filter(Item.id == item_id, Item.status == "inbox").first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Inbox item not found"}})

    cat = db.query(Category).filter(Category.id == payload.category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_CATEGORY", "message": "Category not found"}})

    import json
    item.name = payload.name.strip()
    item.category_id = cat.id
    item.location_id = payload.location_id
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

@router.post("/bulk", response_model=SuccessResponse)
def bulk_inbox_action(
    payload: InboxBulkRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    items = db.query(Item).filter(Item.id.in_(payload.ids), Item.status == "inbox").all()
    count = 0
    for it in items:
        if payload.action == "set_location":
            it.location_id = payload.params.get("location_id")
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
    current: Profile = Depends(require("member"))
):
    item = db.query(Item).filter(Item.id == item_id, Item.status == "inbox").first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Inbox item not found"}})

    item.deleted_at = datetime.now(timezone.utc).isoformat()
    item.deleted_by = current.id
    db.commit()

    record(db, "item", "deleted", f"Discarded inbox item '{item.name}'", entity_id=item.id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message="Inbox item discarded to trash")
