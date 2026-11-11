import re
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Item, Location, Profile
from backend.app.schemas import CodeResolveResponse
from backend.app.services.item_service import map_item
from backend.app.services.permissions import require
from backend.app.routers.locations import map_location
from backend.app.routers.settings import get_setting_val

router = APIRouter(prefix="/codes", tags=["Codes"])

ITEM_CODE_REGEX = re.compile(r"^(?:I|i|item:)(\d+)$")
LOC_CODE_REGEX = re.compile(r"^(?:L|l|loc:|location:)(\d+)$")
URL_ITEM_REGEX = re.compile(r"(?:#/i/|/items/|/i/)(\d+)")
URL_LOC_REGEX = re.compile(r"(?:#/l/|/locations/|/l/)(\d+)")

@router.get("/resolve", response_model=CodeResolveResponse)
def resolve_code(
    code: str = Query(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    raw = code.strip()
    target_type = None
    target_id = None

    # Check URL patterns first
    url_item_match = URL_ITEM_REGEX.search(raw)
    if url_item_match:
        target_type = "item"
        target_id = int(url_item_match.group(1))
    else:
        url_loc_match = URL_LOC_REGEX.search(raw)
        if url_loc_match:
            target_type = "location"
            target_id = int(url_loc_match.group(1))

    # Check prefix patterns
    if not target_type:
        item_match = ITEM_CODE_REGEX.match(raw)
        if item_match:
            target_type = "item"
            target_id = int(item_match.group(1))
        else:
            loc_match = LOC_CODE_REGEX.match(raw)
            if loc_match:
                target_type = "location"
                target_id = int(loc_match.group(1))

    if not target_type or target_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_CODE", "message": f"Could not parse code: '{raw}'"}}
        )

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))

    if target_type == "item":
        item = db.query(Item).filter(Item.id == target_id, Item.deleted_at.is_(None)).first()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "NOT_FOUND", "message": f"Item I{target_id} not found"}}
            )
        return CodeResolveResponse(
            type="item",
            id=target_id,
            item=map_item(item, db, warn_days),
            location=None
        )
    else:
        loc = db.query(Location).filter(Location.id == target_id, Location.deleted_at.is_(None)).first()
        if not loc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "NOT_FOUND", "message": f"Location L{target_id} not found"}}
            )
        items_count = db.query(Item).filter(Item.location_id == target_id, Item.deleted_at.is_(None)).count()
        return CodeResolveResponse(
            type="location",
            id=target_id,
            item=None,
            location=map_location(loc, db, items_count)
        )
