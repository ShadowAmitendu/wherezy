from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import ReminderState, Profile, Setting
from backend.app.schemas import (
    ReminderOut, ReminderSnoozeRequest, ReminderDismissRequest,
    ReminderCountResponse, WebhookTestResponse, SuccessResponse
)
from backend.app.services.permissions import require
from backend.app.services.reminders import compute_reminders

router = APIRouter(tags=["Reminders"])

@router.get("/reminders", response_model=List[ReminderOut])
def get_reminders(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    within_days: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    """List computed reminders (overdue, due_soon, snoozed, dismissed) for current user."""
    return compute_reminders(
        db=db,
        profile_id=current.id,
        status_filter=status,
        source_filter=source,
        within_days=within_days
    )

@router.get("/reminders/count", response_model=ReminderCountResponse)
def get_reminders_count(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    """Badge counts for reminder centre."""
    all_rems = compute_reminders(db=db, profile_id=current.id)
    overdue = sum(1 for r in all_rems if r.status == "overdue")
    due_soon = sum(1 for r in all_rems if r.status == "due_soon")
    return ReminderCountResponse(
        overdue=overdue,
        due_soon=due_soon,
        total=overdue + due_soon
    )

@router.post("/reminders/snooze", response_model=SuccessResponse)
def snooze_reminder(
    payload: ReminderSnoozeRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    """Snooze a reminder for current profile."""
    if payload.snoozed_until:
        until_date = payload.snoozed_until
    elif payload.snooze_days:
        until_date = (date.today() + timedelta(days=payload.snooze_days)).isoformat()
    else:
        until_date = (date.today() + timedelta(days=7)).isoformat()

    state = db.query(ReminderState).filter(
        ReminderState.source_type == payload.source_type,
        ReminderState.item_id == payload.item_id,
        ReminderState.field_key == payload.field_key,
        ReminderState.due_date == payload.due_date,
        ReminderState.profile_id == current.id
    ).first()

    if not state:
        state = ReminderState(
            source_type=payload.source_type,
            item_id=payload.item_id,
            field_key=payload.field_key,
            due_date=payload.due_date,
            profile_id=current.id,
            snoozed_until=until_date
        )
        db.add(state)
    else:
        state.snoozed_until = until_date
        state.dismissed_at = None

    db.commit()
    return SuccessResponse(ok=True, message=f"Reminder snoozed until {until_date}")

@router.post("/reminders/dismiss", response_model=SuccessResponse)
def dismiss_reminder(
    payload: ReminderDismissRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    """Dismiss a reminder for current profile."""
    today_str = date.today().isoformat()
    state = db.query(ReminderState).filter(
        ReminderState.source_type == payload.source_type,
        ReminderState.item_id == payload.item_id,
        ReminderState.field_key == payload.field_key,
        ReminderState.due_date == payload.due_date,
        ReminderState.profile_id == current.id
    ).first()

    if not state:
        state = ReminderState(
            source_type=payload.source_type,
            item_id=payload.item_id,
            field_key=payload.field_key,
            due_date=payload.due_date,
            profile_id=current.id,
            dismissed_at=today_str
        )
        db.add(state)
    else:
        state.dismissed_at = today_str
        state.snoozed_until = None

    db.commit()
    return SuccessResponse(ok=True, message="Reminder dismissed")

@router.post("/admin/webhook-test", response_model=WebhookTestResponse)
def test_webhook(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    """Test the configured LAN webhook URL."""
    import urllib.request
    import json
    row = db.query(Setting).filter(Setting.key == "webhook_url").first()
    url = None
    if row:
        try:
            url = json.loads(row.value_json)
        except Exception:
            pass

    if not url:
        return WebhookTestResponse(ok=False, message="No webhook URL configured in settings")

    # SSRF Guard: only allow http or https
    if not (url.startswith("http://") or url.startswith("https://")):
        return WebhookTestResponse(ok=False, message="Webhook URL must begin with http:// or https://")

    payload = json.dumps({"event": "test", "message": "HomeInventory LAN Webhook Test", "sent_by": current.name}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return WebhookTestResponse(ok=True, status_code=response.status, message="Webhook test successful")
    except Exception as e:
        return WebhookTestResponse(ok=False, message=f"Webhook request failed: {str(e)}")
