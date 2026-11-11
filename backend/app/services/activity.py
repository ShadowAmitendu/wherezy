import json
from typing import Optional, Dict, Any, Union
from sqlalchemy.orm import Session
from backend.app.models import Activity, Profile, Item

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
        # Revert taken_out state and quantity
        old_taken = diff.get("taken_out", [None, None])[0]
        old_taken_qty = diff.get("taken_out_quantity", [None, None])[0]
        if old_taken is not None or old_taken_qty is not None:
            item_qty = max(1, int(item.quantity or 1))
            if old_taken_qty is not None:
                restored_qty = max(0, min(item_qty, int(old_taken_qty)))
            else:
                restored_qty = 1 if old_taken else 0
            item.taken_out_quantity = restored_qty
            item.taken_out = 1 if restored_qty > 0 else 0
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

