from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Set, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models import Location, Item
from backend.app.schemas import LocationBreadcrumb
from backend.app.services.visibility import items_visible

ROOM_GROUP_KINDS: Tuple[str, ...] = (
    "Room",
    "Storage Room",
    "Garage",
    "Shed",
    "Attic",
    "Basement",
)
STORAGE_AREA_KINDS: Tuple[str, ...] = (
    "Storage Area",
    "Shelf",
    "Cupboard",
    "Closet",
    "Rack",
    "Drawer",
    "Box",
    "Bin",
    "Bag",
)
ALLOWED_LOCATION_KINDS: Tuple[str, ...] = ROOM_GROUP_KINDS + STORAGE_AREA_KINDS
LOCATION_KIND_BY_LOWER: Dict[str, str] = {k.lower(): k for k in ALLOWED_LOCATION_KINDS}
ROOM_KIND_SET_LOWER: Set[str] = {k.lower() for k in ROOM_GROUP_KINDS}


@dataclass(frozen=True)
class LocationNodeMetrics:
    direct_items_count: int
    total_items_count: int
    children_count: int
    room_id: Optional[int]
    room_name: Optional[str]
    direct_items_quantity: int = 0
    total_items_quantity: int = 0


def is_room_kind(kind: Optional[str]) -> bool:
    """Return True when kind represents a room or top-level grouping space."""
    return (kind or "").strip().lower() in ROOM_KIND_SET_LOWER


def normalize_location_kind(raw_kind: Optional[str], default: str = "Room") -> str:
    """Normalize a known kind casing or preserve a custom non-empty kind cleanly."""
    cleaned = (raw_kind or "").strip()
    if not cleaned:
        return default
    return LOCATION_KIND_BY_LOWER.get(cleaned.lower(), cleaned)


def validate_location_hierarchy(
    db: Session,
    kind: Optional[str],
    parent_id: Optional[int],
) -> Optional[Location]:
    """Ensure parent exists and prevent Rooms from being nested inside shelves or containers."""
    if parent_id is None:
        return None

    parent = (
        db.query(Location)
        .filter(Location.id == parent_id, Location.deleted_at.is_(None))
        .first()
    )
    if not parent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PARENT_NOT_FOUND", "message": "Parent location not found"}},
        )

    if is_room_kind(kind) and not is_room_kind(parent.kind):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_HIERARCHY",
                    "message": (
                        f"A {normalize_location_kind(kind)} is a higher grouping element and cannot be placed "
                        f"inside '{parent.name}' ({parent.kind}). Place shelves or storage areas inside a Room instead."
                    ),
                }
            },
        )

    return parent


def get_descendant_location_ids(db: Session, location_id: int) -> Set[int]:
    """Return all descendant location IDs including location_id itself."""
    descendants = {location_id}
    children = db.query(Location.id).filter(
        Location.parent_id == location_id,
        Location.deleted_at.is_(None)
    ).all()
    for (child_id,) in children:
        descendants.update(get_descendant_location_ids(db, child_id))
    return descendants

def would_create_cycle(db: Session, location_id: int, target_parent_id: Optional[int]) -> bool:
    """Check if setting target_parent_id as parent of location_id would create a cycle."""
    if target_parent_id is None:
        return False
    if target_parent_id == location_id:
        return True
    descendants = get_descendant_location_ids(db, location_id)
    return target_parent_id in descendants

def get_location_breadcrumbs(db: Session, location_id: int) -> List[LocationBreadcrumb]:
    """Return root-to-current breadcrumb list."""
    crumbs = []
    curr_id = location_id
    visited = set()
    while curr_id and curr_id not in visited:
        visited.add(curr_id)
        loc = db.query(Location).filter(Location.id == curr_id).first()
        if not loc:
            break
        crumbs.append(LocationBreadcrumb(id=loc.id, name=loc.name, kind=loc.kind))
        curr_id = loc.parent_id
    crumbs.reverse()
    return crumbs


def get_root_room(db: Session, location_id: Optional[int]) -> Optional[LocationBreadcrumb]:
    """Return the outermost Room-tier ancestor (or self) for a location, if any."""
    if not location_id:
        return None
    crumbs = get_location_breadcrumbs(db, location_id)
    for crumb in crumbs:
        if is_room_kind(crumb.kind):
            return crumb
    return None


def compute_location_tree_metrics(
    nodes: Sequence[Location],
    direct_counts_map: Dict[int, int],
    direct_quantities_map: Optional[Dict[int, int]] = None,
) -> Dict[int, LocationNodeMetrics]:
    """Compute rolled-up item totals, quantities, child counts, and enclosing Room for active locations."""
    if direct_quantities_map is None:
        direct_quantities_map = direct_counts_map

    children_by_parent: Dict[Optional[int], List[Location]] = {}
    for node in nodes:
        children_by_parent.setdefault(node.parent_id, []).append(node)

    metrics: Dict[int, LocationNodeMetrics] = {}
    visiting: Set[int] = set()

    def walk(node: Location, active_room: Optional[Tuple[int, str]]) -> Tuple[int, int]:
        if node.id in metrics:
            return (metrics[node.id].total_items_count, metrics[node.id].total_items_quantity)
        if node.id in visiting:
            return (direct_counts_map.get(node.id, 0), direct_quantities_map.get(node.id, 0))

        visiting.add(node.id)
        next_room = active_room
        if next_room is None and is_room_kind(node.kind):
            next_room = (node.id, node.name)

        children = children_by_parent.get(node.id, [])
        direct_cnt = int(direct_counts_map.get(node.id, 0) or 0)
        direct_qty = int(direct_quantities_map.get(node.id, 0) or 0)
        total_cnt = direct_cnt
        total_qty = direct_qty
        for child in children:
            c_cnt, c_qty = walk(child, next_room)
            total_cnt += c_cnt
            total_qty += c_qty

        metrics[node.id] = LocationNodeMetrics(
            direct_items_count=direct_cnt,
            total_items_count=total_cnt,
            children_count=len(children),
            room_id=next_room[0] if next_room else None,
            room_name=next_room[1] if next_room else None,
            direct_items_quantity=direct_qty,
            total_items_quantity=total_qty,
        )
        visiting.remove(node.id)
        return (total_cnt, total_qty)

    for root in children_by_parent.get(None, []):
        walk(root, None)

    for node in nodes:
        if node.id not in metrics:
            walk(node, None)

    return metrics


def get_location_subtree_quantity(
    db: Session,
    location_id: int,
    exclude_item_ids: Optional[Sequence[int]] = None,
) -> int:
    """Return the total quantity of active items assigned to location_id and all its descendants."""
    descendant_ids = get_descendant_location_ids(db, location_id)
    q = (
        items_visible(db, db.query(func.coalesce(func.sum(Item.quantity), 0)))
        .filter(Item.location_id.in_(descendant_ids))
    )
    if exclude_item_ids:
        q = q.filter(~Item.id.in_(list(exclude_item_ids)))
    return int(q.scalar() or 0)


def validate_location_capacity(
    db: Session,
    location_id: int,
    additional_quantity: int = 1,
    exclude_item_ids: Optional[Sequence[int]] = None,
) -> None:
    """
    Verify that adding additional_quantity to location_id does not exceed
    max_quantity on location_id or any of its ancestor locations.
    Raises HTTPException(status_code=400) if capacity would be exceeded.
    """
    if not location_id or additional_quantity <= 0:
        return

    crumbs = get_location_breadcrumbs(db, location_id)
    # Check each location in hierarchy (target location up to root)
    for crumb in crumbs:
        loc = db.query(Location).filter(Location.id == crumb.id, Location.deleted_at.is_(None)).first()
        if not loc or loc.max_quantity is None:
            continue

        max_q = int(loc.max_quantity)
        current_q = get_location_subtree_quantity(db, loc.id, exclude_item_ids=exclude_item_ids)
        new_total = current_q + additional_quantity

        if new_total > max_q:
            available = max(0, max_q - current_q)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "LOCATION_CAPACITY_EXCEEDED",
                        "message": (
                            f"Location '{loc.name}' capacity exceeded: maximum allowed quantity is {max_q}, "
                            f"currently has {current_q} and cannot accept {additional_quantity} more "
                            f"(available capacity: {available})."
                        ),
                        "location_id": loc.id,
                        "location_name": loc.name,
                        "max_quantity": max_q,
                        "current_quantity": current_q,
                        "requested_quantity": additional_quantity,
                        "available_capacity": available,
                    }
                },
            )


def get_location_path_str(db: Session, location_id: int) -> str:
    crumbs = get_location_breadcrumbs(db, location_id)
    return " > ".join(c.name for c in crumbs) if crumbs else ""


def build_location_path_map(db: Session) -> Dict[int, str]:
    """Build an in-memory map of active location_id -> full breadcrumb path string."""
    locations = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    by_id = {loc.id: loc for loc in locations}
    paths: Dict[int, str] = {}
    for loc in locations:
        parts: List[str] = []
        curr: Optional[Location] = loc
        visited: Set[int] = set()
        while curr is not None and curr.id not in visited:
            visited.add(curr.id)
            parts.append(curr.name)
            curr = by_id.get(curr.parent_id) if curr.parent_id is not None else None
        parts.reverse()
        paths[loc.id] = " > ".join(parts)
    return paths
