import uuid
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from backend.app.models import Item, Category, Tag, ItemTag, BoxItem, Profile, Activity
from backend.app.schemas import BulkRequest, BulkResponse, BulkSkipItem, BatchUndoResponse
from backend.app.services.visibility import items_visible
from backend.app.services.activity import record

MAX_BULK_LIMIT = 1000

def execute_bulk(db: Session, req: BulkRequest, actor: Profile) -> BulkResponse:
    # Resolve items
    if req.ids:
        item_ids = req.ids[:MAX_BULK_LIMIT]
        items = db.query(Item).filter(Item.id.in_(item_ids)).all()
    elif req.filter:
        q = items_visible(db)
        if req.filter.category_id:
            q = q.filter(Item.category_id == req.filter.category_id)
        if req.filter.location_id:
            q = q.filter(Item.location_id == req.filter.location_id)
        if req.filter.taken_out is not None:
            q = q.filter(Item.taken_out == (1 if req.filter.taken_out else 0))
        if req.filter.q:
            q = q.filter(Item.name.ilike(f"%{req.filter.q.strip()}%"))
        items = q.limit(MAX_BULK_LIMIT).all()
    else:
        return BulkResponse(ok=True, dry_run=req.dry_run, changed=0, skipped=[], batch_id=None)

    batch_id = str(uuid.uuid4())
    changed_count = 0
    skipped: List[BulkSkipItem] = []

    for item in items:
        skip_reason = None

        if req.action == "move":
            new_loc_id = req.params.get("location_id")
            if not req.dry_run:
                old_loc = item.location_id
                item.location_id = new_loc_id
                record(
                    db, "item", "moved",
                    f"Moved '{item.name}' to location #{new_loc_id}",
                    entity_id=item.id, actor=actor, batch_id=batch_id,
                    diff={"location_id": [old_loc, new_loc_id]}
                )
            changed_count += 1

        elif req.action == "add_tags":
            tag_ids = req.params.get("tag_ids", [])
            if not req.dry_run:
                current_tags = {link.tag_id for link in db.query(ItemTag).filter(ItemTag.item_id == item.id).all()}
                to_add = [tid for tid in tag_ids if tid not in current_tags]
                if len(current_tags) + len(to_add) > 20:
                    skip_reason = "Tag limit (20) exceeded"
                else:
                    for tid in to_add:
                        db.add(ItemTag(item_id=item.id, tag_id=tid))
                    record(
                        db, "item", "tags_added",
                        f"Added tags to '{item.name}'",
                        entity_id=item.id, actor=actor, batch_id=batch_id,
                        diff={"tags_added": [[], to_add]}
                    )
                    changed_count += 1
            else:
                changed_count += 1

        elif req.action == "remove_tags":
            tag_ids = req.params.get("tag_ids", [])
            if not req.dry_run:
                db.query(ItemTag).filter(ItemTag.item_id == item.id, ItemTag.tag_id.in_(tag_ids)).delete(synchronize_session=False)
                record(
                    db, "item", "tags_removed",
                    f"Removed tags from '{item.name}'",
                    entity_id=item.id, actor=actor, batch_id=batch_id,
                    diff={"tags_removed": [tag_ids, []]}
                )
            changed_count += 1

        elif req.action == "set_taken":
            taken_out = bool(req.params.get("taken_out", False))
            taken_by = req.params.get("taken_by")
            taken_due = req.params.get("taken_due")
            taken_by_profile_id = req.params.get("taken_by_profile_id")
            taken_by_contact_id = req.params.get("taken_by_contact_id")

            if not req.dry_run:
                old_taken = item.taken_out
                item.taken_out = 1 if taken_out else 0
                item.taken_by = taken_by if taken_out else None
                item.taken_due = taken_due if taken_out else None
                item.taken_by_profile_id = taken_by_profile_id if taken_out else None
                item.taken_by_contact_id = taken_by_contact_id if taken_out else None
                item.taken_at = datetime.now(timezone.utc).isoformat() if taken_out else None

                record(
                    db, "item", "taken_out" if taken_out else "returned",
                    f"{'Lent out' if taken_out else 'Returned'} '{item.name}'",
                    entity_id=item.id, actor=actor, batch_id=batch_id,
                    diff={"taken_out": [old_taken, item.taken_out]}
                )
            changed_count += 1

        elif req.action == "set_expiry":
            if not item.category or not item.category.track_expiry:
                skip_reason = "Category does not track expiry"
            else:
                expiry_date = req.params.get("expiry_date")
                if not req.dry_run:
                    old_exp = item.expiry_date
                    item.expiry_date = expiry_date
                    record(
                        db, "item", "updated",
                        f"Updated expiry date on '{item.name}'",
                        entity_id=item.id, actor=actor, batch_id=batch_id,
                        diff={"expiry_date": [old_exp, expiry_date]}
                    )
                changed_count += 1

        elif req.action == "retire":
            if item.taken_out:
                skip_reason = "Item is currently taken out"
            else:
                reason = req.params.get("reason", "donated")
                on_date = req.params.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
                note = req.params.get("note")
                if not req.dry_run:
                    item.status = "retired"
                    item.retired_reason = reason
                    item.retired_on = on_date
                    item.retired_note = note[:500] if note else None
                    item.retired_by = actor.id
                    record(
                        db, "item", "retired",
                        f"Retired '{item.name}' ({reason})",
                        entity_id=item.id, actor=actor, batch_id=batch_id,
                        diff={"status": ["active", "retired"], "retired_reason": [None, reason]}
                    )
                changed_count += 1

        elif req.action == "add_to_box":
            box_id = req.params.get("box_id")
            # Check if item is already in an active box
            existing_active_box = db.query(BoxItem).filter(BoxItem.item_id == item.id, BoxItem.active == 1).first()
            if existing_active_box:
                skip_reason = f"Item is already packed in box #{existing_active_box.box_id}"
            else:
                if not req.dry_run:
                    db.add(BoxItem(box_id=box_id, item_id=item.id, active=1))
                    record(
                        db, "box", "packed",
                        f"Packed '{item.name}' into box #{box_id}",
                        entity_id=box_id, actor=actor, batch_id=batch_id
                    )
                changed_count += 1

        elif req.action == "delete":
            if not req.dry_run:
                now_iso = datetime.now(timezone.utc).isoformat()
                item.deleted_at = now_iso
                item.deleted_by = actor.id
                record(
                    db, "item", "deleted",
                    f"Moved '{item.name}' to trash",
                    entity_id=item.id, actor=actor, batch_id=batch_id,
                    diff={"deleted_at": [None, now_iso]}
                )
            changed_count += 1

        if skip_reason:
            skipped.append(BulkSkipItem(id=item.id, name=item.name, reason=skip_reason))

    if not req.dry_run:
        db.commit()

    return BulkResponse(
        ok=True,
        dry_run=req.dry_run,
        changed=changed_count,
        skipped=skipped,
        batch_id=batch_id if not req.dry_run and changed_count > 0 else None
    )

def undo_batch(db: Session, batch_id: str, actor: Profile) -> BatchUndoResponse:
    events = db.query(Activity).filter(Activity.batch_id == batch_id).all()
    if not events:
        raise ValueError(f"Batch {batch_id} not found or has no recorded events")

    reverted_count = 0
    for act in events:
        if act.entity_type == "item" and act.diff_json and act.entity_id:
            item = db.query(Item).filter(Item.id == act.entity_id).first()
            if not item:
                continue
            diff = json.loads(act.diff_json)

            if "location_id" in diff:
                old_loc = diff["location_id"][0]
                item.location_id = old_loc
                reverted_count += 1

            if "status" in diff and diff["status"][1] == "retired":
                item.status = "active"
                item.retired_reason = None
                item.retired_on = None
                item.retired_note = None
                item.retired_by = None
                reverted_count += 1

            if "deleted_at" in diff and diff["deleted_at"][1] is not None:
                item.deleted_at = None
                item.deleted_by = None
                reverted_count += 1

            if "taken_out" in diff:
                old_taken = diff["taken_out"][0]
                item.taken_out = 1 if old_taken else 0
                reverted_count += 1

            if "expiry_date" in diff:
                item.expiry_date = diff["expiry_date"][0]
                reverted_count += 1

            if "tags_added" in diff:
                added = diff["tags_added"][1]
                db.query(ItemTag).filter(ItemTag.item_id == item.id, ItemTag.tag_id.in_(added)).delete(synchronize_session=False)
                reverted_count += 1

            if "tags_removed" in diff:
                removed = diff["tags_removed"][0]
                for tid in removed:
                    db.add(ItemTag(item_id=item.id, tag_id=tid))
                reverted_count += 1

    record(
        db, "system", "batch_undo",
        f"Reverted batch #{batch_id[:8]} ({reverted_count} changes undone)",
        actor=actor
    )
    db.commit()
    return BatchUndoResponse(ok=True, batch_id=batch_id, reverted_count=reverted_count)
