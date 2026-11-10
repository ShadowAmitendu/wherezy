from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Contact, Item, Activity, Profile
from backend.app.schemas import (
    ContactOut, ContactCreate, ContactUpdate, ContactLoansOut,
    ContactLoanItem, SuccessResponse
)
from backend.app.services.permissions import require
from backend.app.services.visibility import items_visible
from backend.app.services.activity import record

router = APIRouter(prefix="/contacts", tags=["Contacts & Lending"])

def _to_out(c: Contact, is_viewer: bool, db: Session) -> ContactOut:
    # Count items out and overdue
    active_items = items_visible(db).filter(Item.taken_by_contact_id == c.id, Item.taken_out == 1).all()
    today_str = date.today().isoformat()
    overdue_count = sum(1 for it in active_items if it.taken_due and it.taken_due < today_str)

    return ContactOut(
        id=c.id,
        name=c.name,
        # Strip phone numbers completely for Viewers!
        phone=None if is_viewer else c.phone,
        note=c.note,
        is_active=bool(c.is_active),
        items_out_count=len(active_items),
        overdue_count=overdue_count,
        created_at=c.created_at,
        updated_at=c.updated_at
    )

@router.get("", response_model=List[ContactOut])
def list_contacts(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    q = db.query(Contact)
    if not include_inactive:
        q = q.filter(Contact.is_active == 1)
    is_viewer = current.role == "viewer"
    return [_to_out(c, is_viewer, db) for c in q.order_by(Contact.name).all()]

@router.post("", response_model=ContactOut)
def create_contact(
    payload: ContactCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_NAME", "message": "Name is required"}})

    # Loose phone validation (digits, spaces, + - ( ), 5 to 20 chars)
    phone = payload.phone.strip() if payload.phone else None
    if phone and not (5 <= len(phone) <= 25):
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_PHONE", "message": "Phone number must be 5 to 25 characters"}})

    contact = Contact(
        name=name,
        phone=phone,
        note=payload.note,
        is_active=1
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)

    # Never log phone numbers to activity
    record(db, "contact", "created", f"Created contact '{contact.name}'", entity_id=contact.id, actor=current)
    db.commit()

    return _to_out(contact, is_viewer=False, db=db)

@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Contact not found"}})

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_NAME", "message": "Name cannot be empty"}})
        contact.name = name

    if payload.phone is not None:
        contact.phone = payload.phone.strip() if payload.phone.strip() else None

    if payload.note is not None:
        contact.note = payload.note

    if payload.is_active is not None:
        contact.is_active = 1 if payload.is_active else 0

    db.commit()
    db.refresh(contact)

    record(db, "contact", "updated", f"Updated contact '{contact.name}'", entity_id=contact.id, actor=current)
    db.commit()

    return _to_out(contact, is_viewer=(current.role == "viewer"), db=db)

@router.delete("/{contact_id}", response_model=SuccessResponse)
def delete_or_deactivate_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Contact not found"}})

    # Check if contact has loan history in items or activity
    has_items = db.query(Item).filter(Item.taken_by_contact_id == contact.id).count() > 0
    if has_items:
        # Deactivate, never delete
        contact.is_active = 0
        db.commit()
        record(db, "contact", "deactivated", f"Deactivated contact '{contact.name}' (has loan history)", entity_id=contact.id, actor=current)
        db.commit()
        return SuccessResponse(ok=True, message=f"Contact '{contact.name}' has loan history and was deactivated")

    name = contact.name
    db.delete(contact)
    db.commit()
    record(db, "contact", "deleted", f"Deleted contact '{name}'", entity_id=contact_id, actor=current)
    db.commit()
    return SuccessResponse(ok=True, message=f"Contact '{name}' deleted")

@router.get("/{contact_id}/loans", response_model=ContactLoansOut)
def get_contact_loans(
    contact_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Contact not found"}})

    is_viewer = current.role == "viewer"
    active_items = items_visible(db).filter(Item.taken_by_contact_id == contact.id, Item.taken_out == 1).all()

    today_str = date.today().isoformat()
    active_loans = [
        ContactLoanItem(
            id=it.id,
            name=it.name,
            category_name=it.category.name if it.category else None,
            location_path=it.location.name if it.location else None,
            taken_at=it.taken_at,
            taken_due=it.taken_due,
            is_overdue=bool(it.taken_due and it.taken_due < today_str)
        )
        for it in active_items
    ]

    # Returned loans from activity (last 20)
    returned_events = (
        db.query(Activity)
        .filter(Activity.entity_type == "item", Activity.action == "returned", Activity.summary.ilike(f"%{contact.name}%"))
        .order_by(Activity.id.desc())
        .limit(20)
        .all()
    )
    returned_list = [
        {"id": act.id, "at": act.at, "summary": act.summary}
        for act in returned_events
    ]

    return ContactLoansOut(
        contact=_to_out(contact, is_viewer, db),
        active_loans=active_loans,
        returned_loans=returned_list
    )
