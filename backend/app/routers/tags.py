from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Tag, ItemTag, Item, Profile
from backend.app.schemas import TagOut, TagCreate, TagUpdate, TagMergeRequest, ItemTagsReplaceRequest, SuccessResponse
from backend.app.services.permissions import require
from backend.app.services.activity import record
from backend.app.services.visibility import items_visible

router = APIRouter(prefix="/tags", tags=["Tags"])

@router.get("", response_model=List[TagOut])
def list_tags(db: Session = Depends(get_db), current: Profile = Depends(require("viewer"))):
    """List all tags with active items count."""
    tags = db.query(Tag).order_by(Tag.name).all()
    # Count only active visible items per tag
    active_item_ids = {it.id for it in items_visible(db).all()}
    
    counts = (
        db.query(ItemTag.tag_id, func.count(ItemTag.item_id))
        .filter(ItemTag.item_id.in_(active_item_ids) if active_item_ids else False)
        .group_by(ItemTag.tag_id)
        .all()
    )
    count_map = dict(counts)

    return [
        TagOut(
            id=t.id,
            name=t.name,
            color=t.color,
            created_at=t.created_at,
            items_count=count_map.get(t.id, 0)
        )
        for t in tags
    ]

@router.post("", response_model=TagOut)
def create_tag(payload: TagCreate, db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    name = payload.name.strip()
    if not (1 <= len(name) <= 32):
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_NAME", "message": "Tag name must be 1 to 32 characters"}})

    existing = db.query(Tag).filter(func.lower(Tag.name) == name.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail={"error": {"code": "DUPLICATE_TAG", "message": f"Tag '{name}' already exists"}})

    tag = Tag(name=name, color=payload.color or "#757575")
    db.add(tag)
    db.commit()
    db.refresh(tag)

    record(db, "tag", "created", f"Created tag '{tag.name}'", entity_id=tag.id, actor=current)
    db.commit()

    return TagOut(id=tag.id, name=tag.name, color=tag.color, created_at=tag.created_at, items_count=0)

@router.put("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, payload: TagUpdate, db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Tag not found"}})

    if payload.name is not None:
        name = payload.name.strip()
        if not (1 <= len(name) <= 32):
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_NAME", "message": "Tag name must be 1 to 32 characters"}})
        existing = db.query(Tag).filter(func.lower(Tag.name) == name.lower(), Tag.id != tag.id).first()
        if existing:
            raise HTTPException(status_code=400, detail={"error": {"code": "DUPLICATE_TAG", "message": f"Tag '{name}' already exists"}})
        tag.name = name

    if payload.color is not None:
        tag.color = payload.color

    db.commit()
    db.refresh(tag)

    record(db, "tag", "updated", f"Updated tag '{tag.name}'", entity_id=tag.id, actor=current)
    db.commit()

    count = db.query(ItemTag).filter(ItemTag.tag_id == tag.id).count()
    return TagOut(id=tag.id, name=tag.name, color=tag.color, created_at=tag.created_at, items_count=count)

@router.delete("/{tag_id}", response_model=SuccessResponse)
def delete_tag(tag_id: int, db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Tag not found"}})

    count = db.query(ItemTag).filter(ItemTag.tag_id == tag.id).count()
    name = tag.name
    db.delete(tag)
    db.commit()

    record(db, "tag", "deleted", f"Deleted tag '{name}' (was on {count} items)", entity_id=tag_id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Tag '{name}' deleted")

@router.post("/{tag_id}/merge", response_model=SuccessResponse)
def merge_tags(tag_id: int, payload: TagMergeRequest, db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    source = db.query(Tag).filter(Tag.id == tag_id).first()
    target = db.query(Tag).filter(Tag.id == payload.target_tag_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Source or target tag not found"}})
    if source.id == target.id:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_MERGE", "message": "Cannot merge tag into itself"}})

    # Re-link items from source to target (avoid duplicates)
    source_links = db.query(ItemTag).filter(ItemTag.tag_id == source.id).all()
    moved_count = 0
    for link in source_links:
        existing = db.query(ItemTag).filter(ItemTag.item_id == link.item_id, ItemTag.tag_id == target.id).first()
        if not existing:
            db.add(ItemTag(item_id=link.item_id, tag_id=target.id))
            moved_count += 1
        db.delete(link)

    src_name = source.name
    target_name = target.name
    db.delete(source)
    db.commit()

    record(
        db, "tag", "merged",
        f"Merged tag '{src_name}' into '{target_name}' ({moved_count} items reassigned)",
        entity_id=target.id, actor=current
    )
    db.commit()

    return SuccessResponse(ok=True, message=f"Merged '{src_name}' into '{target_name}'")

@router.put("/items/{item_id}", response_model=SuccessResponse)
def set_item_tags(item_id: int, payload: ItemTagsReplaceRequest, db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    if len(payload.tag_ids) > 20:
        raise HTTPException(status_code=400, detail={"error": {"code": "TAG_LIMIT", "message": "Max 20 tags per item"}})

    valid_tags = db.query(Tag).filter(Tag.id.in_(payload.tag_ids)).all() if payload.tag_ids else []
    valid_ids = {t.id for t in valid_tags}

    # Clear old tags and insert new
    db.query(ItemTag).filter(ItemTag.item_id == item.id).delete()
    for tid in valid_ids:
        db.add(ItemTag(item_id=item.id, tag_id=tid))

    db.commit()
    record(db, "item", "tags_changed", f"Updated tags on item '{item.name}'", entity_id=item.id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message="Tags updated")
