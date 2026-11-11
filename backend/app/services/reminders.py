import json
from datetime import date, timedelta
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from backend.app.models import FieldDef, ReminderState, Profile, Contact, Setting
from backend.app.schemas import ReminderOut
from backend.app.services.visibility import items_visible

def get_today_str(ref_date: Optional[str] = None) -> str:
    if ref_date:
        return ref_date
    return date.today().isoformat()

def compute_reminders(
    db: Session,
    profile_id: Optional[int] = None,
    ref_date: Optional[str] = None,
    status_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    within_days: Optional[int] = None
) -> List[ReminderOut]:
    today_str = get_today_str(ref_date)
    today = date.fromisoformat(today_str)

    # Global expiry warn days setting
    warn_row = db.query(Setting).filter(Setting.key == "expiry_warn_days").first()
    default_lead_days = 30
    if warn_row:
        try:
            default_lead_days = int(json.loads(warn_row.value_json))
        except (json.JSONDecodeError, TypeError, ValueError):
            default_lead_days = 30

    # Read per-profile reminder state
    state_map: Dict[str, ReminderState] = {}
    if profile_id:
        states = db.query(ReminderState).filter(ReminderState.profile_id == profile_id).all()
        for s in states:
            key = f"{s.source_type}:{s.item_id}:{s.field_key or ''}:{s.due_date}"
            state_map[key] = s

    # Active visible items only
    items = items_visible(db).all()
    results: List[ReminderOut] = []

    for item in items:
        # 1. Expiry Source
        if item.expiry_date and item.category and item.category.track_expiry:
            lead = item.category.expiry_lead_days or default_lead_days
            due_str = item.expiry_date
            try:
                due_d = date.fromisoformat(due_str)
                state_key = f"expiry:{item.id}::{due_str}"
                state = state_map.get(state_key)

                rem_status = _evaluate_status(due_d, today, lead, state)
                if rem_status:
                    results.append(ReminderOut(
                        id=f"exp-{item.id}-{due_str}",
                        source_type="expiry",
                        item_id=item.id,
                        item_name=item.name,
                        category_name=item.category.name if item.category else None,
                        due_date=due_str,
                        status=rem_status,
                        lead_days=lead,
                        profile_id=profile_id,
                        snoozed_until=state.snoozed_until if state else None,
                        dismissed_at=state.dismissed_at if state else None,
                    ))
            except ValueError:
                pass

        # 2. Date Fields with remind == 1
        if item.category and item.values_json:
            try:
                values = json.loads(item.values_json)
            except Exception:
                values = {}

            # Check category date fields
            field_defs = db.query(FieldDef).filter(
                FieldDef.category_id == item.category_id,
                FieldDef.type == "date",
                FieldDef.remind == 1,
                FieldDef.archived == 0
            ).all()

            for fdef in field_defs:
                val_date_str = values.get(fdef.key)
                if val_date_str:
                    try:
                        base_d = date.fromisoformat(val_date_str)
                        offset = fdef.remind_offset_days or 0
                        due_d = base_d + timedelta(days=offset)
                        due_str = due_d.isoformat()
                        lead = fdef.remind_lead_days or 30

                        state_key = f"field:{item.id}:{fdef.key}:{due_str}"
                        state = state_map.get(state_key)
                        rem_status = _evaluate_status(due_d, today, lead, state)
                        if rem_status:
                            results.append(ReminderOut(
                                id=f"fld-{item.id}-{fdef.key}-{due_str}",
                                source_type="field",
                                item_id=item.id,
                                item_name=item.name,
                                category_name=item.category.name if item.category else None,
                                field_key=fdef.key,
                                field_label=fdef.label,
                                due_date=due_str,
                                status=rem_status,
                                lead_days=lead,
                                profile_id=profile_id,
                                snoozed_until=state.snoozed_until if state else None,
                                dismissed_at=state.dismissed_at if state else None,
                            ))
                    except ValueError:
                        pass

        # 3. Loans Source
        if item.taken_out and item.taken_due:
            try:
                due_d = date.fromisoformat(item.taken_due)
                due_str = item.taken_due
                state_key = f"loan:{item.id}::{due_str}"
                state = state_map.get(state_key)

                lead = 7  # 7 days lead for loans
                rem_status = _evaluate_status(due_d, today, lead, state)

                # Borrower resolution
                borrower_name = item.taken_by
                borrower_phone = None
                if item.taken_by_profile_id:
                    p = db.query(Profile).filter(Profile.id == item.taken_by_profile_id).first()
                    if p:
                        borrower_name = p.name
                elif item.taken_by_contact_id:
                    c = db.query(Contact).filter(Contact.id == item.taken_by_contact_id).first()
                    if c:
                        borrower_name = c.name
                        borrower_phone = c.phone

                if rem_status:
                    results.append(ReminderOut(
                        id=f"loan-{item.id}-{due_str}",
                        source_type="loan",
                        item_id=item.id,
                        item_name=item.name,
                        category_name=item.category.name if item.category else None,
                        due_date=due_str,
                        status=rem_status,
                        lead_days=lead,
                        profile_id=profile_id,
                        borrower_name=borrower_name,
                        borrower_phone=borrower_phone,
                        snoozed_until=state.snoozed_until if state else None,
                        dismissed_at=state.dismissed_at if state else None,
                    ))
            except ValueError:
                pass

    # Apply filters
    filtered = results
    if status_filter:
        filtered = [r for r in filtered if r.status == status_filter]
    if source_filter:
        filtered = [r for r in filtered if r.source_type == source_filter]
    if within_days is not None:
        limit_date = today + timedelta(days=within_days)
        filtered = [r for r in filtered if date.fromisoformat(r.due_date) <= limit_date]

    # Sort: overdue first, then by due_date ascending
    return sorted(filtered, key=lambda x: (0 if x.status == "overdue" else (1 if x.status == "due_soon" else 2), x.due_date))

def _evaluate_status(due_d: date, today: date, lead: int, state: Optional[ReminderState]) -> str:
    if state and state.dismissed_at:
        return "dismissed"
    if state and state.snoozed_until:
        try:
            snooze_d = date.fromisoformat(state.snoozed_until)
            if today <= snooze_d:
                return "snoozed"
        except ValueError:
            pass

    if due_d < today:
        return "overdue"
    elif today <= due_d <= today + timedelta(days=lead):
        return "due_soon"
    else:
        return "later"
