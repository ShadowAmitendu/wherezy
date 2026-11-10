from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Item, Category, Location, Tag, FieldDef, Contact, Profile
from backend.app.schemas import (
    OfflineSnapshotOut, OfflineChangesOut, ItemOut, CategoryOut,
    LocationOut, TagOut, FieldDefOut, ContactOut
)
from backend.app.services.permissions import require
from backend.app.services.visibility import items_visible
from backend.app.services.reminders import compute_reminders

router = APIRouter(prefix="/offline", tags=["Offline Mode"])

@router.get("/snapshot", response_model=OfflineSnapshotOut)
def get_offline_snapshot(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    """
    Complete active read-only snapshot for client IndexedDB storage.
    Viewers NEVER receive contact phone numbers.
    """
    is_viewer = current.role == "viewer"

    # Active items only
    items = items_visible(db).all()
    it_outs = [
        ItemOut(
            id=it.id,
            name=it.name,
            category_id=it.category_id,
            category_name=it.category.name if it.category else None,
            category_icon=it.category.icon if it.category else None,
            category_color=it.category.color if it.category else None,
            location_id=it.location_id,
            location_name=it.location.name if it.location else None,
            taken_out=bool(it.taken_out),
            taken_by=it.taken_by,
            taken_at=it.taken_at,
            expiry_date=it.expiry_date,
            notes=it.notes,
            created_at=it.created_at,
            updated_at=it.updated_at
        )
        for it in items
    ]

    # Categories
    cats = db.query(Category).filter(Category.deleted_at.is_(None)).all()
    cat_outs = [
        CategoryOut(
            id=c.id,
            name=c.name,
            icon=c.icon,
            color=c.color,
            track_expiry=bool(c.track_expiry),
            expiry_label=c.expiry_label,
            sort_order=c.sort_order,
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in cats
    ]

    # Locations
    locs = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    loc_outs = [
        LocationOut(
            id=l.id,
            parent_id=l.parent_id,
            name=l.name,
            kind=l.kind,
            notes=l.notes,
            sort_order=l.sort_order,
            created_at=l.created_at,
            updated_at=l.updated_at
        )
        for l in locs
    ]

    # Tags
    tags = db.query(Tag).all()
    tag_outs = [
        TagOut(id=t.id, name=t.name, color=t.color, created_at=t.created_at)
        for t in tags
    ]

    # Field Defs
    fdefs = db.query(FieldDef).filter(FieldDef.archived == 0).all()
    import json
    fdef_outs = [
        FieldDefOut(
            id=f.id,
            category_id=f.category_id,
            key=f.key,
            label=f.label,
            type=f.type,
            required=bool(f.required),
            options=json.loads(f.options_json) if f.options_json else None,
            unit=f.unit,
            hint=f.hint
        )
        for f in fdefs
    ]

    # Reminders
    rems = compute_reminders(db=db, profile_id=current.id)

    # Contacts (phone stripped for Viewers)
    contacts = db.query(Contact).filter(Contact.is_active == 1).all()
    cont_outs = [
        ContactOut(
            id=c.id,
            name=c.name,
            phone=None if is_viewer else c.phone,
            note=c.note,
            is_active=bool(c.is_active),
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in contacts
    ]

    return OfflineSnapshotOut(
        schema_version=10,
        timestamp=datetime.now(timezone.utc).isoformat(),
        categories=cat_outs,
        locations=loc_outs,
        items=it_outs,
        tags=tag_outs,
        field_defs=fdef_outs,
        reminders=rems,
        contacts=cont_outs
    )

@router.get("/changes", response_model=OfflineChangesOut)
def get_offline_changes(
    cursor: str = Query(...),  # ISO timestamp
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    """Incremental sync: changed rows + tombstones for deleted/retired/inbox items."""
    changed_items = items_visible(db).filter(Item.updated_at > cursor).all()
    it_outs = [
        ItemOut(
            id=it.id,
            name=it.name,
            category_id=it.category_id,
            category_name=it.category.name if it.category else None,
            category_icon=it.category.icon if it.category else None,
            category_color=it.category.color if it.category else None,
            location_id=it.location_id,
            location_name=it.location.name if it.location else None,
            taken_out=bool(it.taken_out),
            taken_by=it.taken_by,
            taken_at=it.taken_at,
            expiry_date=it.expiry_date,
            notes=it.notes,
            created_at=it.created_at,
            updated_at=it.updated_at
        )
        for it in changed_items
    ]

    # Removed/tombstoned items (deleted_at > cursor OR (status != 'active' AND updated_at > cursor))
    removed_ids = [
        r[0] for r in db.query(Item.id).filter(
            (Item.deleted_at > cursor) | ((Item.status != "active") & (Item.updated_at > cursor))
        ).all()
    ]

    return OfflineChangesOut(
        timestamp=datetime.now(timezone.utc).isoformat(),
        items_changed=it_outs,
        items_removed=removed_ids
    )
