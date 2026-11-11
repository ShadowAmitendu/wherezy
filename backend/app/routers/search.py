from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Item, Location, Category, Tag, Contact, Profile
from backend.app.schemas import QuickSearchResponse, QuickSearchResult
from backend.app.services.item_service import format_item_code, parse_item_code
from backend.app.services.permissions import require
from backend.app.services.visibility import items_visible

router = APIRouter(prefix="/search", tags=["Search"])

ACTIONS = [
    QuickSearchResult(type="action", title="Add New Item", subtitle="Open new item dialog", url="/items?action=new"),
    QuickSearchResult(type="action", title="Quick Capture Inbox", subtitle="Snap photos now, sort later", url="/inbox/capture"),
    QuickSearchResult(type="action", title="Reminder Centre", subtitle="View due and overdue reminders", url="/reminders"),
    QuickSearchResult(type="action", title="Data Health", subtitle="Audit items missing location, photos, duplicates", url="/health"),
    QuickSearchResult(type="action", title="Scan Code", subtitle="Scan QR or Barcode", url="/scan"),
    QuickSearchResult(type="action", title="Moving House", subtitle="Manage packing boxes and moves", url="/moves"),
    QuickSearchResult(type="action", title="Contacts & Loans", subtitle="Manage borrowers and lending", url="/contacts"),
    QuickSearchResult(type="action", title="Trash & Recycle Bin", subtitle="Restore or purge deleted items", url="/trash"),
]

@router.get("/quick", response_model=QuickSearchResponse)
def quick_search(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    term = q.strip().lower()
    results: List[QuickSearchResult] = []

    # 1. Matching Actions
    for act in ACTIONS:
        if term in act.title.lower() or (act.subtitle and term in act.subtitle.lower()):
            results.append(act)

    # 2. Items (active visible only, max 8)
    code_id = parse_item_code(q)
    item_filter = Item.name.ilike(f"%{term}%")
    if code_id is not None:
        item_filter = or_(item_filter, Item.id == code_id)
    items = items_visible(db).filter(item_filter).limit(8).all()
    for it in items:
        loc_path = it.location.name if it.location else "No location"
        cat_name = it.category.name if it.category else "Uncategorized"
        results.append(QuickSearchResult(
            type="item",
            id=it.id,
            title=it.name,
            subtitle=f"{format_item_code(it.id)} • {cat_name} • {loc_path}",
            url=f"/items?selected={it.id}"
        ))

    # 3. Locations (active only, max 8)
    locations = db.query(Location).filter(Location.deleted_at.is_(None), Location.name.ilike(f"%{term}%")).limit(8).all()
    for loc in locations:
        results.append(QuickSearchResult(
            type="location",
            id=loc.id,
            title=loc.name,
            subtitle=f"{loc.kind} location",
            url=f"/locations?selected={loc.id}"
        ))

    # 4. Categories (active only, max 8)
    categories = db.query(Category).filter(Category.deleted_at.is_(None), Category.name.ilike(f"%{term}%")).limit(8).all()
    for cat in categories:
        results.append(QuickSearchResult(
            type="category",
            id=cat.id,
            title=cat.name,
            subtitle="Category",
            url=f"/items?category={cat.id}"
        ))

    # 5. Tags (max 8)
    tags = db.query(Tag).filter(Tag.name.ilike(f"%{term}%")).limit(8).all()
    for t in tags:
        results.append(QuickSearchResult(
            type="tag",
            id=t.id,
            title=f"#{t.name}",
            subtitle="Tag",
            url=f"/items?tag={t.id}"
        ))

    # 6. Contacts (active only, max 8)
    contacts = db.query(Contact).filter(Contact.is_active == 1, Contact.name.ilike(f"%{term}%")).limit(8).all()
    for c in contacts:
        results.append(QuickSearchResult(
            type="contact",
            id=c.id,
            title=c.name,
            subtitle=c.note or "Contact",
            url=f"/contacts?selected={c.id}"
        ))

    return QuickSearchResponse(results=results)
