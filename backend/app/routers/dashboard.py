from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Item, Category, Location, Profile
from backend.app.schemas import DashboardResponse, CategoryCount, RoomCount
from backend.app.services.item_service import map_item
from backend.app.services.location_service import compute_location_tree_metrics, is_room_kind
from backend.app.routers.settings import get_setting_val
from backend.app.services.visibility import items_visible
from backend.app.services.permissions import require

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    today_str = date.today().isoformat()
    warn_date_str = (date.today() + timedelta(days=warn_days)).isoformat()

    total_items = items_visible(db).count()
    total_quantity = int(
        items_visible(db, db.query(func.coalesce(func.sum(Item.quantity), 0))).scalar() or 0
    )
    taken_out_count = items_visible(db).filter(Item.taken_out == 1).count()
    taken_out_quantity_total = int(
        items_visible(db, db.query(func.coalesce(func.sum(Item.taken_out_quantity), 0)))
        .filter(Item.taken_out == 1)
        .scalar()
        or 0
    )

    expired_count = items_visible(db).filter(
        Item.expiry_date.isnot(None),
        Item.expiry_date != "",
        Item.expiry_date < today_str
    ).count()

    expiring_soon_count = items_visible(db).filter(
        Item.expiry_date.isnot(None),
        Item.expiry_date != "",
        Item.expiry_date >= today_str,
        Item.expiry_date <= warn_date_str
    ).count()

    # Category counts
    cats = db.query(Category).filter(Category.deleted_at.is_(None)).order_by(Category.sort_order).all()
    counts_raw = (
        items_visible(db, db.query(Item.category_id, func.count(Item.id)))
        .group_by(Item.category_id)
        .all()
    )
    counts_map = dict(counts_raw)
    category_counts = [
        CategoryCount(
            id=c.id,
            name=c.name,
            icon=c.icon,
            color=c.color,
            count=counts_map.get(c.id, 0)
        )
        for c in cats
    ]

    # Room / top-level storage space counts (higher grouping totals across shelves/storage areas)
    all_locs = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    loc_counts_raw = (
        items_visible(db, db.query(Item.location_id, func.count(Item.id)))
        .filter(Item.location_id.isnot(None))
        .group_by(Item.location_id)
        .all()
    )
    loc_metrics = compute_location_tree_metrics(all_locs, dict(loc_counts_raw))
    root_rooms = [l for l in all_locs if l.parent_id is None and is_room_kind(l.kind)]
    root_rooms.sort(key=lambda l: (l.sort_order, l.id))
    room_counts = [
        RoomCount(
            id=r.id,
            name=r.name,
            kind=r.kind,
            storage_only=bool(getattr(r, "storage_only", 0)) and (loc_metrics[r.id].children_count == 0 if r.id in loc_metrics else True),
            sub_locations_count=loc_metrics[r.id].children_count if r.id in loc_metrics else 0,
            direct_items_count=loc_metrics[r.id].direct_items_count if r.id in loc_metrics else 0,
            items_count=loc_metrics[r.id].total_items_count if r.id in loc_metrics else 0,
        )
        for r in root_rooms
    ]

    # Expiring items (both expired and soon)
    expiring_items_models = (
        items_visible(db)
        .filter(
            Item.expiry_date.isnot(None),
            Item.expiry_date != "",
            Item.expiry_date <= warn_date_str
        )
        .order_by(Item.expiry_date.asc())
        .limit(10)
        .all()
    )
    expiring_items = [map_item(it, db, warn_days) for it in expiring_items_models]

    # Recent items
    recent_items_models = (
        items_visible(db)
        .order_by(Item.created_at.desc())
        .limit(10)
        .all()
    )
    recent_items = [map_item(it, db, warn_days) for it in recent_items_models]

    return DashboardResponse(
        total_items=total_items,
        total_quantity=total_quantity,
        category_counts=category_counts,
        room_counts=room_counts,
        taken_out_count=taken_out_count,
        taken_out_quantity_total=taken_out_quantity_total,
        expired_count=expired_count,
        expiring_soon_count=expiring_soon_count,
        expiring_items=expiring_items,
        recent_items=recent_items
    )
