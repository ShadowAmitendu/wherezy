from datetime import datetime, timezone, date
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Item, Photo, Profile, Setting, Contact
from backend.app.schemas import WallResponse, WallItemOut, ReminderOut
from backend.app.services.permissions import require
from backend.app.services.visibility import items_visible
from backend.app.services.reminders import compute_reminders

router = APIRouter(tags=["Wall Display"])

@router.get("/wall", response_model=WallResponse)
def get_wall_data(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("wall:read"))
):
    """
    Read-only kitchen tablet wall display data.
    Strictly NO phone numbers, active items only.
    Accessible by display profiles (is_display = 1).
    """
    today_str = date.today().isoformat()

    # Household name setting
    h_row = db.query(Setting).filter(Setting.key == "household_name").first()
    household_name = None
    if h_row:
        import json
        try:
            household_name = json.loads(h_row.value_json)
        except Exception:
            pass

    # Reminders: overdue & due soon
    all_rems = compute_reminders(db=db, profile_id=current.id)
    # Strip any phone number for wall display
    overdue_rems = []
    due_soon_rems = []
    for r in all_rems:
        r_clean = r.model_copy()
        r_clean.borrower_phone = None  # Wall display never shows phone numbers
        if r.status == "overdue":
            overdue_rems.append(r_clean)
        elif r.status == "due_soon":
            due_soon_rems.append(r_clean)

    # Taken out items
    taken_items = items_visible(db).filter(Item.taken_out == 1).all()
    wall_taken: List[WallItemOut] = []

    for it in taken_items:
        borrower_name = it.taken_by
        if it.taken_by_profile_id:
            p = db.query(Profile).filter(Profile.id == it.taken_by_profile_id).first()
            if p:
                borrower_name = p.name
        elif it.taken_by_contact_id:
            c = db.query(Contact).filter(Contact.id == it.taken_by_contact_id).first()
            if c:
                borrower_name = c.name

        cover = db.query(Photo).filter(Photo.owner_type == "item", Photo.owner_id == it.id, Photo.is_cover == 1).first()
        thumb_url = f"/api/photos/{cover.id}/thumb" if cover else None
        is_overdue = bool(it.taken_due and it.taken_due < today_str)

        wall_taken.append(WallItemOut(
            id=it.id,
            name=it.name,
            since=it.taken_at[:10] if it.taken_at else None,
            due_date=it.taken_due,
            borrower_name=borrower_name,
            is_overdue=is_overdue,
            thumb_url=thumb_url
        ))

    return WallResponse(
        overdue=overdue_rems,
        due_soon=due_soon_rems,
        taken_out=wall_taken,
        generated_at=datetime.now(timezone.utc).isoformat(),
        household_name=household_name
    )
