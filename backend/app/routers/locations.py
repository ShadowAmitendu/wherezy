from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Location, Item, Photo, Profile, utc_now_iso
from backend.app.schemas import (
    LocationOut, LocationTreeOut, LocationDetailOut, LocationCreate,
    LocationUpdate, LocationMoveRequest, LocationBatchChildrenRequest, SuccessResponse
)
from backend.app.services.location_service import (
    LocationNodeMetrics,
    compute_location_tree_metrics,
    get_location_breadcrumbs,
    get_location_path_str,
    get_location_subtree_quantity,
    get_root_room,
    is_room_kind,
    normalize_location_kind,
    validate_location_hierarchy,
    would_create_cycle,
)
from backend.app.routers.photos import map_photo
from backend.app.services.visibility import items_visible
from backend.app.services.permissions import require
from backend.app.services.activity import record

router = APIRouter(prefix="/locations", tags=["Locations"])


def _get_location_item_counts_map(db: Session) -> dict:
    counts = (
        items_visible(db, db.query(Item.location_id, func.count(Item.id)))
        .filter(Item.location_id.isnot(None))
        .group_by(Item.location_id)
        .all()
    )
    return dict(counts)


def _get_location_item_quantities_map(db: Session) -> dict:
    quantities = (
        items_visible(db, db.query(Item.location_id, func.coalesce(func.sum(Item.quantity), 0)))
        .filter(Item.location_id.isnot(None))
        .group_by(Item.location_id)
        .all()
    )
    return dict(quantities)


def map_location(
    loc: Location,
    db: Session,
    items_count: int = 0,
    metrics: Optional[LocationNodeMetrics] = None,
) -> LocationOut:
    path = get_location_path_str(db, loc.id)
    room_mode = is_room_kind(loc.kind)

    if metrics is not None:
        direct_count = metrics.direct_items_count
        total_count = metrics.total_items_count
        children_count = metrics.children_count
        room_id = metrics.room_id
        room_name = metrics.room_name
        current_total_qty = metrics.total_items_quantity
    else:
        direct_count = int(items_count or 0)
        total_count = direct_count
        children_count = (
            db.query(Location)
            .filter(Location.parent_id == loc.id, Location.deleted_at.is_(None))
            .count()
        )
        root_room = get_root_room(db, loc.id)
        room_id = root_room.id if root_room else None
        room_name = root_room.name if root_room else None
        current_total_qty = get_location_subtree_quantity(db, loc.id)

    max_q = getattr(loc, "max_quantity", None)
    if max_q is not None and max_q > 0:
        available_cap = max(0, max_q - current_total_qty)
    else:
        available_cap = None

    return LocationOut(
        id=loc.id,
        name=loc.name,
        kind=loc.kind,
        notes=loc.notes,
        parent_id=loc.parent_id,
        sort_order=loc.sort_order,
        created_at=loc.created_at,
        updated_at=loc.updated_at,
        items_count=direct_count,
        total_items_count=total_count,
        children_count=children_count,
        is_room=room_mode,
        storage_only=bool(getattr(loc, "storage_only", 0)) and room_mode and children_count == 0,
        max_quantity=max_q,
        available_capacity=available_cap,
        room_id=room_id,
        room_name=room_name,
        path=path,
    )


def build_tree(
    nodes: List[Location],
    parent_id: Optional[int],
    metrics_map: dict,
    db: Session,
) -> List[LocationTreeOut]:
    branch = []
    for node in nodes:
        if node.parent_id == parent_id:
            children = build_tree(nodes, node.id, metrics_map, db)
            metrics = metrics_map.get(node.id)
            base_out = map_location(
                node,
                db,
                metrics.direct_items_count if metrics else 0,
                metrics=metrics,
            )
            tree_node = LocationTreeOut(**base_out.model_dump(), children=children)
            branch.append(tree_node)
    branch.sort(key=lambda x: (x.sort_order, x.id))
    return branch


@router.get("/tree", response_model=List[LocationTreeOut])
def get_locations_tree(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:read"))
):
    all_locs = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    counts_map = _get_location_item_counts_map(db)
    quantities_map = _get_location_item_quantities_map(db)
    metrics_map = compute_location_tree_metrics(all_locs, counts_map, quantities_map)
    return build_tree(all_locs, None, metrics_map, db)


@router.post("", response_model=LocationOut)
def create_location(
    payload: LocationCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:write"))
):
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "Location name is required"}},
        )

    clean_kind = normalize_location_kind(payload.kind, "Room")
    parent = validate_location_hierarchy(db, clean_kind, payload.parent_id)

    starter_children = [c for c in (payload.children or []) if (c.name or "").strip()]
    for child in starter_children:
        child_kind = normalize_location_kind(child.kind, "Shelf")
        if is_room_kind(child_kind):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_HIERARCHY",
                        "message": "Shelves or storage areas inside a Room cannot have kind Room.",
                    }
                },
            )

    if parent and getattr(parent, "storage_only", 0):
        parent.storage_only = 0
        parent.updated_at = utc_now_iso()

    max_sort = (
        db.query(func.max(Location.sort_order))
        .filter(Location.parent_id == payload.parent_id, Location.deleted_at.is_(None))
        .scalar() or 0
    )

    is_storage_only = 1 if (payload.storage_only and is_room_kind(clean_kind) and not starter_children) else 0
    loc = Location(
        name=clean_name,
        kind=clean_kind,
        storage_only=is_storage_only,
        max_quantity=payload.max_quantity,
        notes=payload.notes.strip() if payload.notes else None,
        parent_id=payload.parent_id,
        sort_order=max_sort + 1,
    )
    db.add(loc)
    db.flush()

    for idx, child in enumerate(starter_children, start=1):
        child_loc = Location(
            name=child.name.strip(),
            kind=normalize_location_kind(child.kind, "Shelf"),
            storage_only=0,
            max_quantity=child.max_quantity,
            notes=child.notes.strip() if child.notes else None,
            parent_id=loc.id,
            sort_order=idx,
        )
        db.add(child_loc)

    db.commit()
    db.refresh(loc)

    record(db, "location", "created", f"Created location '{loc.name}'", entity_id=loc.id, actor=current)
    db.commit()

    return map_location(loc, db, 0)


@router.post("/{id}/children", response_model=List[LocationOut])
def add_location_children(
    id: int,
    payload: LocationBatchChildrenRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:write"))
):
    parent = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not parent:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    cleaned_children = [c for c in (payload.children or []) if (c.name or "").strip()]
    if not cleaned_children:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "Provide at least one shelf or storage area name"}},
        )

    for child in cleaned_children:
        child_kind = normalize_location_kind(child.kind, "Shelf")
        validate_location_hierarchy(db, child_kind, parent.id)
        if is_room_kind(child_kind):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_HIERARCHY",
                        "message": "Sub-locations inside a Room should be Shelves, Storage Areas, Cupboards, Drawers, or Boxes.",
                    }
                },
            )

    if getattr(parent, "storage_only", 0):
        parent.storage_only = 0
        parent.updated_at = utc_now_iso()

    max_sort = (
        db.query(func.max(Location.sort_order))
        .filter(Location.parent_id == parent.id, Location.deleted_at.is_(None))
        .scalar() or 0
    )

    created_children: List[Location] = []
    for idx, child in enumerate(cleaned_children, start=1):
        child_loc = Location(
            name=child.name.strip(),
            kind=normalize_location_kind(child.kind, "Shelf"),
            storage_only=0,
            max_quantity=child.max_quantity,
            notes=child.notes.strip() if child.notes else None,
            parent_id=parent.id,
            sort_order=max_sort + idx,
        )
        db.add(child_loc)
        created_children.append(child_loc)

    db.commit()
    for child_loc in created_children:
        db.refresh(child_loc)

    record(
        db,
        "location",
        "created",
        f"Added {len(created_children)} sub-location(s) under '{parent.name}'",
        entity_id=parent.id,
        actor=current,
    )
    db.commit()

    return [map_location(child_loc, db, 0) for child_loc in created_children]


@router.get("/{id}", response_model=LocationDetailOut)
def get_location(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:read"))
):
    loc = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    all_locs = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    counts_map = _get_location_item_counts_map(db)
    quantities_map = _get_location_item_quantities_map(db)
    metrics_map = compute_location_tree_metrics(all_locs, counts_map, quantities_map)

    crumbs = get_location_breadcrumbs(db, id)
    photos = db.query(Photo).filter(Photo.owner_type == "location", Photo.owner_id == id).order_by(Photo.sort_order).all()

    child_locs = [n for n in all_locs if n.parent_id == id]
    child_locs.sort(key=lambda x: (x.sort_order, x.id))
    child_outs = [
        map_location(
            c,
            db,
            metrics_map[c.id].direct_items_count if c.id in metrics_map else 0,
            metrics=metrics_map.get(c.id),
        )
        for c in child_locs
    ]

    loc_metrics = metrics_map.get(id)
    base_out = map_location(
        loc,
        db,
        loc_metrics.direct_items_count if loc_metrics else 0,
        metrics=loc_metrics,
    )
    return LocationDetailOut(
        **base_out.model_dump(),
        breadcrumbs=crumbs,
        photos=[map_photo(p) for p in photos],
        children=child_outs,
    )


@router.put("/{id}", response_model=LocationOut)
def update_location(
    id: int,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:write"))
):
    loc = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    parent_set = "parent_id" in payload.model_fields_set
    target_parent_id = payload.parent_id if parent_set else loc.parent_id
    target_kind = normalize_location_kind(payload.kind, loc.kind) if payload.kind is not None else loc.kind

    if parent_set and target_parent_id != loc.parent_id:
        if would_create_cycle(db, id, target_parent_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "CYCLE_DETECTED", "message": "Cannot move a location into itself or one of its descendants"}}
            )

    target_parent = validate_location_hierarchy(db, target_kind, target_parent_id)
    if parent_set and target_parent_id != loc.parent_id:
        loc.parent_id = target_parent_id
        if target_parent and getattr(target_parent, "storage_only", 0):
            target_parent.storage_only = 0
            target_parent.updated_at = utc_now_iso()

    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"error": {"code": "VALIDATION_ERROR", "message": "Location name is required"}},
            )
        loc.name = clean_name
    if payload.kind is not None:
        loc.kind = target_kind
    if payload.notes is not None:
        loc.notes = payload.notes.strip() if payload.notes else None
    if payload.sort_order is not None:
        loc.sort_order = payload.sort_order

    if payload.storage_only is not None:
        if payload.storage_only:
            if not is_room_kind(loc.kind):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": {"code": "INVALID_HIERARCHY", "message": "Only Room or top-level space types can be marked as storage-only places."}},
                )
            active_children = db.query(Location).filter(Location.parent_id == id, Location.deleted_at.is_(None)).count()
            if active_children > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": {"code": "HAS_SUBLOCATIONS", "message": "Move or remove sub-locations first before switching this Room to storage-only mode."}},
                )
            loc.storage_only = 1
        else:
            loc.storage_only = 0
    elif not is_room_kind(loc.kind):
        loc.storage_only = 0

    if "max_quantity" in payload.model_fields_set:
        if payload.max_quantity is not None:
            current_q = get_location_subtree_quantity(db, loc.id)
            if payload.max_quantity < current_q:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "code": "LOCATION_CAPACITY_EXCEEDED",
                            "message": (
                                f"Cannot set maximum quantity to {payload.max_quantity} because location '{loc.name}' "
                                f"already contains {current_q} items/units. Please relocate items first."
                            ),
                            "location_id": loc.id,
                            "current_quantity": current_q,
                            "requested_max_quantity": payload.max_quantity,
                        }
                    },
                )
            loc.max_quantity = payload.max_quantity
        else:
            loc.max_quantity = None

    loc.updated_at = utc_now_iso()
    db.commit()
    db.refresh(loc)

    record(db, "location", "updated", f"Updated location '{loc.name}'", entity_id=loc.id, actor=current)
    db.commit()

    items_count = items_visible(db).filter(Item.location_id == id).count()
    return map_location(loc, db, items_count)

@router.delete("/{id}", response_model=SuccessResponse)
def delete_location(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:write"))
):
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

    # Check active items
    items_count = items_visible(db).filter(Item.location_id == id).count()
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
    loc.deleted_by = current.id if current else None
    db.commit()

    record(db, "location", "deleted", f"Moved location '{loc.name}' to trash", entity_id=loc.id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Location '{loc.name}' deleted")

@router.post("/{id}/move", response_model=LocationOut)
def move_location(
    id: int,
    payload: LocationMoveRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:write"))
):
    loc = db.query(Location).filter(Location.id == id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    if would_create_cycle(db, id, payload.parent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "CYCLE_DETECTED", "message": "Cannot move a location into itself or one of its descendants"}}
        )

    target_parent = validate_location_hierarchy(db, loc.kind, payload.parent_id)
    if target_parent and getattr(target_parent, "storage_only", 0):
        target_parent.storage_only = 0
        target_parent.updated_at = utc_now_iso()

    loc.parent_id = payload.parent_id
    loc.updated_at = utc_now_iso()
    db.commit()
    db.refresh(loc)

    record(db, "location", "moved", f"Moved location '{loc.name}'", entity_id=loc.id, actor=current)
    db.commit()

    items_count = items_visible(db).filter(Item.location_id == id).count()
    return map_location(loc, db, items_count)
