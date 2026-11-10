from typing import List, Optional, Set
from sqlalchemy.orm import Session
from backend.app.models import Location
from backend.app.schemas import LocationBreadcrumb

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

def get_location_path_str(db: Session, location_id: int) -> str:
    crumbs = get_location_breadcrumbs(db, location_id)
    return " > ".join(c.name for c in crumbs) if crumbs else ""
