import json
from datetime import date, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from backend.app.models import Item, Photo, Category, Location
from backend.app.schemas import ItemOut, ItemDetailOut, ExpiryStatus
from backend.app.services.location_service import get_location_breadcrumbs, get_location_path_str
from backend.app.routers.categories import map_field
from backend.app.routers.photos import map_photo

def compute_expiry_status(expiry_date_str: Optional[str], warn_days: int = 30) -> Optional[ExpiryStatus]:
    if not expiry_date_str or not expiry_date_str.strip():
        return "none"
    try:
        exp = date.fromisoformat(expiry_date_str.strip()[:10])
    except Exception:
        return "none"

    today = date.today()
    if exp < today:
        return "expired"
    elif exp <= today + timedelta(days=warn_days):
        return "soon"
    else:
        return "ok"

def map_item(item: Item, db: Session, warn_days: int = 30) -> ItemOut:
    values = {}
    if item.values_json:
        try:
            values = json.loads(item.values_json)
        except Exception:
            values = {}

    exp_status = compute_expiry_status(item.expiry_date, warn_days)

    cat_name = item.category.name if item.category else None
    cat_icon = item.category.icon if item.category else None
    cat_color = item.category.color if item.category else None

    loc_name = item.location.name if item.location else None
    loc_path = get_location_path_str(db, item.location_id) if item.location_id else None

    # Cover photo
    cover_photo = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == item.id, Photo.is_cover == 1).first()
    if not cover_photo:
        cover_photo = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == item.id).order_by(Photo.sort_order).first()

    cover_id = cover_photo.id if cover_photo else None
    cover_thumb = f"/api/photos/{cover_photo.id}/thumb" if cover_photo else None

    return ItemOut(
        id=item.id,
        name=item.name,
        category_id=item.category_id,
        category_name=cat_name,
        category_icon=cat_icon,
        category_color=cat_color,
        location_id=item.location_id,
        location_name=loc_name,
        location_path=loc_path,
        taken_out=bool(item.taken_out),
        taken_by=item.taken_by,
        taken_at=item.taken_at,
        expiry_date=item.expiry_date,
        expiry_status=exp_status,
        notes=item.notes,
        values=values,
        cover_photo_id=cover_id,
        cover_thumb_url=cover_thumb,
        created_at=item.created_at,
        updated_at=item.updated_at
    )

def map_item_detail(item: Item, db: Session, warn_days: int = 30) -> ItemDetailOut:
    base = map_item(item, db, warn_days)
    crumbs = get_location_breadcrumbs(db, item.location_id) if item.location_id else []
    photos = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == item.id).order_by(Photo.sort_order).all()
    fields = [map_field(f) for f in item.category.fields if not f.archived] if item.category else []

    return ItemDetailOut(
        **base.model_dump(),
        breadcrumbs=crumbs,
        photos=[map_photo(p) for p in photos],
        field_defs=fields
    )
