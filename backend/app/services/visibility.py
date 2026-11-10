from typing import Optional
from sqlalchemy.orm import Session, Query
from backend.app.models import Item

def items_visible(db: Session, base_query: Optional[Query] = None) -> Query:
    """
    Canonical visibility helper:
    Filters items to only those with status = 'active' AND deleted_at IS NULL.
    All search, lists, counts, reminders, audits, exports, and labels use this helper.
    """
    q = base_query if base_query is not None else db.query(Item)
    return q.filter(Item.status == "active", Item.deleted_at.is_(None))
