from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Location, Item, Photo, utc_now_iso
from backend.app.schemas import (
    LocationOut, LocationTreeOut, LocationDetailOut, LocationCreate,
    LocationUpdate, LocationMoveRequest, ItemOut, SuccessResponse
)
from backend.app.services.location_service import (
    get_descendant_location_ids, would_create_cycle,
    get_location_breadcrumbs, get_location_path_str
)
from backend.app.routers.photos import map_photo

router = APIRouter(prefix="/locations", tags=["Locations"])

def map_location(loc: Location, db: Session, items_count: int = 0) -> LocationOut:
    path = get_location_path_str(db, loc.id)
    return LocationOut(
        id=loc.id,
        name=loc.name,
        kind=loc.kind,
        notes=loc.notes,
        parent_id=loc.parent_id,
        sort_order=loc.sort_order,
        created_at=loc.created_at,
        updated_at=loc.updated_at,
        items_count=items_count,
        path=path
    )

def build_tree(nodes: List[Location], parent_id: Optional[int], counts_map: dict, db: Session) -> List[LocationTreeOut]:
    branch = []
    for node in nodes:
        if node.parent_id == parent_id:
            children = build_tree(nodes, node.id, counts_map, db)
            base_out = map_location(node, db, counts_map.get(node.id, 0))
            tree_node = LocationTreeOut(**base_out.model_dump(), children=children)
            branch.append(tree_node)
    branch.sort(key=lambda x: (x.sort_order, x.id))
    return branch

@router.get("/tree", response_model=List[LocationTreeOut])
def get_locations_tree(db: Session = Depends(get_db)):
    all_locs = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    # Count active items per location
    counts = (
        db.query(Item.location_id, func.count(Item.id))
        .filter(Item.deleted_at.is_(None))
        .group_by(Item.location_id)
        .all()
    )
    counts_map = dict(counts)
    return build_tree(all_locs, None, counts_map, db)

@router.post("", response_model=LocationOut)
def create_location(payload: LocationCreate, db: Session = Depends(get_db)):
    if payload.parent_id:
        parent = db.query(Location).filter(Location.id == payload.parent_id, Location.deleted_at.is_(None)).first()
        if not parent:
            raise HTTPException(status_code=404, detail={"error": {"code": "PARENT_NOT_FOUND", "message": "Parent location not found"}})

    max_sort = (
        db.query(func.max(Location.sort_order))
        .filter(Location.parent_id == payload.parent_id, Location.deleted_at.is_(None))
        .scalar() or 0
    )

    loc = Location(
        name=payload.name.strip(),
        kind=payload.kind.strip() or "Room",
        notes=payload.notes.strip() if payload.notes else None,
        parent_id=payload.parent_id,
        sort_order=max_sort + 1
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return map_location(loc, db, 0)

@router.get("/{id}", response_model=LocationDetailOut)
def get_location(id: int, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    crumbs = get_location_breadcrumbs(db, id)
    photos = db.query(Photo).filter(Photo.owner_type == "location", Photo.owner_id == id).order_by(Photo.sort_order).all()
    items_count = db.query(Item).filter(Item.location_id == id, Item.deleted_at.is_(None)).count()

    child_locs = db.query(Location).filter(Location.parent_id == id, Location.deleted_at.is_(None)).order_by(Location.sort_order).all()
    child_outs = [map_location(c, db, db.query(Item).filter(Item.location_id == c.id, Item.deleted_at.is_(None)).count()) for c in child_locs]

    base_out = map_location(loc, db, items_count)
    return LocationDetailOut(
        **base_out.model_dump(),
        breadcrumbs=crumbs,
        photos=[map_photo(p) for p in photos],
        items_count=items_count,
        children=child_outs
    )

@router.put("/{id}", response_model=LocationOut)
def update_location(id: int, payload: LocationUpdate, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    if payload.parent_id is not None:
        if payload.parent_id != loc.parent_id:
            if would_create_cycle(db, id, payload.parent_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": {"code": "CYCLE_DETECTED", "message": "Cannot move a location into itself or one of its descendants"}}
                )
            loc.parent_id = payload.parent_id

    if payload.name is not None:
        loc.name = payload.name.strip()
    if payload.kind is not None:
        loc.kind = payload.kind.strip() or "Room"
    if payload.notes is not None:
        loc.notes = payload.notes.strip() if payload.notes else None
    if payload.sort_order is not None:
        loc.sort_order = payload.sort_order

    loc.updated_at = utc_now_iso()
    db.commit()
    db.refresh(loc)
    items_count = db.query(Item).filter(Item.location_id == id, Item.deleted_at.is_(None)).count()
    return map_location(loc, db, items_count)

@router.delete("/{id}", response_model=SuccessResponse)
def delete_location(id: int, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    # Check child locations
    children_count = db.query(Location).filter(Location.parent_id == id, Location.deleted_at.is_(None)).count()
    if children_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "LOCATION_HAS_CHILDREN",
                    "message": f"Cannot delete location '{loc.name}' because it contains {children_count} sub-location(s). Please move or delete sub-locations first."
                }
            }
        )

    # Check items
    items_count = db.query(Item).filter(Item.location_id == id, Item.deleted_at.is_(None)).count()
    if items_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "LOCATION_HAS_ITEMS",
                    "message": f"Cannot delete location '{loc.name}' because it contains {items_count} item(s). Please move or delete the items first."
                }
            }
        )

    loc.deleted_at = utc_now_iso()
    db.commit()
    return SuccessResponse(ok=True, message=f"Location '{loc.name}' deleted")

@router.post("/{id}/move", response_model=LocationOut)
def move_location(id: int, payload: LocationMoveRequest, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    if would_create_cycle(db, id, payload.parent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "CYCLE_DETECTED", "message": "Cannot move a location into itself or one of its descendants"}}
        )

    loc.parent_id = payload.parent_id
    loc.updated_at = utc_now_iso()
    db.commit()
    db.refresh(loc)
    items_count = db.query(Item).filter(Item.location_id == id, Item.deleted_at.is_(None)).count()
    return map_location(loc, db, items_count)

# Circular import safe items getter is placed in items.py
