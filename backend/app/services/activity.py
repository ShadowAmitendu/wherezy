import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Union
from sqlalchemy.orm import Session
from backend.app.models import Activity, Profile, Item, Location, Setting

SENSITIVE_KEYS = {"pin", "pin_hash", "current_pin", "new_pin", "phone", "token", "cookie", "secret"}

def build_diff(old_vals: Dict[str, Any], new_vals: Dict[str, Any]) -> Optional[str]:
    diff = {}
    all_keys = set(old_vals.keys()).union(new_vals.keys())
    for k in all_keys:
        v_old = old_vals.get(k)
        v_new = new_vals.get(k)
        if v_old != v_new:
            # Sensitive key protection
            if k in SENSITIVE_KEYS:
                diff[k] = ["***" if v_old else None, "***" if v_new else None]
                continue
            # Long string truncation
            s_old = str(v_old)[:80] if isinstance(v_old, str) and len(v_old) > 80 else v_old
            s_new = str(v_new)[:80] if isinstance(v_new, str) and len(v_new) > 80 else v_new
            diff[k] = [s_old, s_new]
    return json.dumps(diff) if diff else None

def record(
    db: Session,
    entity_type: str,
    action: str,
    summary: str,
    entity_id: Optional[int] = None,
    actor: Optional[Union[Profile, int]] = None,
    diff: Optional[Union[str, Dict[str, Any]]] = None,
    batch_id: Optional[str] = None
) -> Activity:
    actor_id = actor.id if isinstance(actor, Profile) else actor
    diff_str = json.dumps(diff) if isinstance(diff, dict) else diff

    event = Activity(
        actor_id=actor_id,
        batch_id=batch_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        summary=summary,
        diff_json=diff_str,
    )
    db.add(event)
    return event

def revert_activity(db: Session, activity_id: int, actor: Optional[Profile] = None) -> Activity:
    act = db.query(Activity).filter(Activity.id == activity_id).first()
    if not act:
        raise ValueError("Activity event not found")

    if act.entity_type != "item" or act.action not in ("moved", "taken_out", "returned"):
        raise ValueError(f"Action '{act.action}' on '{act.entity_type}' cannot be reverted. Only moves and loan toggles support revert.")

    item = db.query(Item).filter(Item.id == act.entity_id).first()
    if not item:
        raise ValueError(f"Item #{act.entity_id} no longer exists")

    if not act.diff_json:
        raise ValueError("No diff recorded for this event to revert")

    diff = json.loads(act.diff_json)

    if act.action == "moved":
        # diff has location_id: [old_loc, new_loc]
        if "location_id" in diff:
            old_loc = diff["location_id"][0]
            item.location_id = old_loc
            summary = f"Reverted move for '{item.name}': returned to location #{old_loc}"
            revert_event = record(
                db=db,
                entity_type="item",
                action="revert",
                summary=summary,
                entity_id=item.id,
                actor=actor,
                diff={"location_id": [diff["location_id"][1], old_loc]}
            )
            return revert_event

    elif act.action in ("taken_out", "returned"):
        # Revert taken_out state
        old_taken = diff.get("taken_out", [None, None])[0]
        if old_taken is not None:
            item.taken_out = 1 if old_taken else 0
            if "taken_by" in diff:
                item.taken_by = diff["taken_by"][0]
            if "taken_due" in diff:
                item.taken_due = diff["taken_due"][0]
            summary = f"Reverted loan status for '{item.name}'"
            revert_event = record(
                db=db,
                entity_type="item",
                action="revert",
                summary=summary,
                entity_id=item.id,
                actor=actor,
                diff=diff
            )
            return revert_event

    raise ValueError("Could not revert activity event")

def prune_retention(db: Session, retention_days: Optional[int] = 365) -> int:
    """Prunes activity older than retention days (system event)."""
    if not retention_days or retention_days <= 0:
        return 0

    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    deleted = db.query(Activity).filter(Activity.at < cutoff).delete()
    if deleted > 0:
        record(
            db=db,
            entity_type="system",
            action="retention_prune",
            summary=f"Activity retention job pruned {deleted} events older than {retention_days} days",
            actor=None
        )
        db.commit()
    return deleted
