from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Item, Category
from backend.app.schemas import DashboardResponse, CategoryCount
from backend.app.services.item_service import map_item
from backend.app.routers.settings import get_setting_val

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    today_str = date.today().isoformat()
    warn_date_str = (date.today() + timedelta(days=warn_days)).isoformat()

    total_items = db.query(Item).filter(Item.deleted_at.is_(None)).count()
    taken_out_count = db.query(Item).filter(Item.deleted_at.is_(None), Item.taken_out == 1).count()

    expired_count = db.query(Item).filter(
        Item.deleted_at.is_(None),
        Item.expiry_date.isnot(None),
        Item.expiry_date != "",
        Item.expiry_date < today_str
    ).count()

    expiring_soon_count = db.query(Item).filter(
        Item.deleted_at.is_(None),
        Item.expiry_date.isnot(None),
        Item.expiry_date != "",
        Item.expiry_date >= today_str,
        Item.expiry_date <= warn_date_str
    ).count()

    # Category counts
    cats = db.query(Category).filter(Category.deleted_at.is_(None)).order_by(Category.sort_order).all()
    counts_raw = (
        db.query(Item.category_id, func.count(Item.id))
        .filter(Item.deleted_at.is_(None))
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

    # Expiring items (both expired and soon)
    expiring_items_models = (
        db.query(Item)
        .filter(
            Item.deleted_at.is_(None),
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
        db.query(Item)
        .filter(Item.deleted_at.is_(None))
        .order_by(Item.created_at.desc())
        .limit(10)
        .all()
    )
    recent_items = [map_item(it, db, warn_days) for it in recent_items_models]

    return DashboardResponse(
        total_items=total_items,
        category_counts=category_counts,
        taken_out_count=taken_out_count,
        expired_count=expired_count,
        expiring_soon_count=expiring_soon_count,
        expiring_items=expiring_items,
        recent_items=recent_items
    )
