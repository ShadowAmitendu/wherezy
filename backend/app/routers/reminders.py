import ipaddress
import json
import socket
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import ReminderState, Profile, Setting
from backend.app.schemas import (
    ReminderOut, ReminderSnoozeRequest, ReminderDismissRequest, ReminderRestoreRequest,
    ReminderCountResponse, WebhookTestResponse, SuccessResponse
)
from backend.app.services.permissions import require
from backend.app.services.reminders import compute_reminders

router = APIRouter(tags=["Reminders"])


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Webhook redirects are not allowed")


def _validate_webhook_url(url: str) -> Optional[str]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return "Webhook URL must be a valid http:// or https:// URL"

    host = parsed.hostname.lower()
    if host in ("localhost", "localhost.localdomain", "metadata.google.internal"):
        return "Webhook URL target host is not permitted"

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (ValueError, socket.gaierror):
        return "Unable to resolve webhook host"

    for info in infos:
        ip_str = info[4][0].split("%")[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return "Unable to validate webhook address"
        if ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_multicast or ip.is_reserved:
            return "Webhook URL target address is not permitted"
    return None

@router.get("/reminders", response_model=List[ReminderOut])
def get_reminders(
    status_filter: Optional[str] = Query(None, alias="status"),
    source: Optional[str] = Query(None),
    within_days: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("reminders:read"))
):
    """List computed reminders (overdue, due_soon, snoozed, dismissed) for current user."""
    return compute_reminders(
        db=db,
        profile_id=current.id,
        status_filter=status_filter,
        source_filter=source,
        within_days=within_days
    )

@router.get("/reminders/count", response_model=ReminderCountResponse)
def get_reminders_count(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("reminders:read"))
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
    current: Profile = Depends(require("reminders:write"))
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
    current: Profile = Depends(require("reminders:write"))
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

@router.post("/reminders/restore", response_model=SuccessResponse)
def restore_reminder(
    payload: ReminderRestoreRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("reminders:write"))
):
    """Restore a reminder back to its previous snoozed/dismissed/active state."""
    state = db.query(ReminderState).filter(
        ReminderState.source_type == payload.source_type,
        ReminderState.item_id == payload.item_id,
        ReminderState.field_key == payload.field_key,
        ReminderState.due_date == payload.due_date,
        ReminderState.profile_id == current.id
    ).first()

    if payload.snoozed_until is None and payload.dismissed_at is None:
        if state:
            db.delete(state)
    elif not state:
        state = ReminderState(
            source_type=payload.source_type,
            item_id=payload.item_id,
            field_key=payload.field_key,
            due_date=payload.due_date,
            profile_id=current.id,
            snoozed_until=payload.snoozed_until,
            dismissed_at=payload.dismissed_at
        )
        db.add(state)
    else:
        state.snoozed_until = payload.snoozed_until
        state.dismissed_at = payload.dismissed_at

    db.commit()
    return SuccessResponse(ok=True, message="Reminder restored")

@router.post("/admin/webhook-test", response_model=WebhookTestResponse)
def test_webhook(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:webhook"))
):
    """Test the configured LAN webhook URL."""
    row = db.query(Setting).filter(Setting.key == "webhook_url").first()
    url = None
    if row:
        try:
            url = json.loads(row.value_json)
        except (json.JSONDecodeError, TypeError):
            url = None

    if not url or not isinstance(url, str):
        return WebhookTestResponse(ok=False, message="No webhook URL configured in settings")

    err = _validate_webhook_url(url.strip())
    if err:
        return WebhookTestResponse(ok=False, message=err)

    payload = json.dumps({"event": "test", "message": "Wherezy LAN Webhook Test", "sent_by": current.name}).encode("utf-8")
    req = urllib.request.Request(url.strip(), data=payload, headers={"Content-Type": "application/json"}, method="POST")
    opener = urllib.request.build_opener(_NoRedirectHandler)

    try:
        with opener.open(req, timeout=5) as response:
            return WebhookTestResponse(ok=True, status_code=response.status, message="Webhook test successful")
    except ValueError as e:
        return WebhookTestResponse(ok=False, message=str(e))
    except Exception:
        return WebhookTestResponse(ok=False, message="Webhook request failed")
