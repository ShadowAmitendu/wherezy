from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Item, Location, Profile
from backend.app.schemas import ItemRetireRequest, ItemUnretireRequest, SuccessResponse
from backend.app.services.permissions import require
from backend.app.services.activity import record

router = APIRouter(tags=["Item Lifecycle"])

@router.post("/items/{item_id}/retire", response_model=SuccessResponse)
def retire_item(
    item_id: int,
    payload: ItemRetireRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    item = db.query(Item).filter(Item.id == item_id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    if item.taken_out:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "ITEM_TAKEN_OUT", "message": "Item is currently lent out. Please return it before retiring."}}
        )

    # Date cannot be in future
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if payload.date > today_str:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_DATE", "message": "Retire date cannot be in the future"}}
        )

    item.status = "retired"
    item.retired_reason = payload.reason
    item.retired_on = payload.date
    item.retired_note = payload.note[:500] if payload.note else None
    item.retired_by = current.id
    db.commit()

    record(
        db, "item", "retired",
        f"Retired '{item.name}' ({payload.reason})",
        entity_id=item.id, actor=current,
        diff={"status": ["active", "retired"], "retired_reason": [None, payload.reason]}
    )
    db.commit()

    return SuccessResponse(ok=True, message=f"Item '{item.name}' retired as {payload.reason}")

@router.post("/items/{item_id}/unretire", response_model=SuccessResponse)
def unretire_item(
    item_id: int,
    payload: ItemUnretireRequest = ItemUnretireRequest(),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    item = db.query(Item).filter(Item.id == item_id, Item.status == "retired").first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Retired item not found"}})

    if payload.location_id:
        loc = db.query(Location).filter(Location.id == payload.location_id, Location.deleted_at.is_(None)).first()
        if not loc:
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_LOCATION", "message": "Location not found"}})
        item.location_id = loc.id
    elif item.location_id:
        loc = db.query(Location).filter(Location.id == item.location_id, Location.deleted_at.is_(None)).first()
        if not loc:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "LOCATION_DELETED", "message": "Previous location was deleted. Please specify a new location."}}
            )

    item.status = "active"
    item.retired_reason = None
    item.retired_on = None
    item.retired_note = None
    item.retired_by = None
    db.commit()

    record(
        db, "item", "unretired",
        f"Brought back '{item.name}' from retirement into active inventory",
        entity_id=item.id, actor=current,
        diff={"status": ["retired", "active"]}
    )
    db.commit()

    return SuccessResponse(ok=True, message=f"Item '{item.name}' returned to active inventory")
