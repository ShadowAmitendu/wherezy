import json
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Audit, Location, Item, BoxItem, Profile
from backend.app.schemas import (
    AuditOut, AuditStartRequest, AuditFoundRequest, AuditSummary, AuditItemSummary
)
from backend.app.services.permissions import require
from backend.app.services.visibility import items_visible
from backend.app.services.activity import record

router = APIRouter(tags=["Shelf Audit"])

def _get_location_ids(db: Session, root_id: int, include_sub: bool) -> List[int]:
    if not include_sub:
        return [root_id]
    result = [root_id]
    to_visit = [root_id]
    while to_visit:
        curr = to_visit.pop(0)
        children = db.query(Location.id).filter(Location.parent_id == curr, Location.deleted_at.is_(None)).all()
        for (cid,) in children:
            result.append(cid)
            to_visit.append(cid)
    return result

@router.post("/audits", response_model=AuditOut)
def start_audit(
    payload: AuditStartRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("audit:write"))
):
    loc = db.query(Location).filter(Location.id == payload.location_id, Location.deleted_at.is_(None)).first()
    if not loc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Location not found"}})

    loc_ids = _get_location_ids(db, loc.id, payload.include_sub)

    # Expected items: active items in these locations
    items = items_visible(db).filter(Item.location_id.in_(loc_ids)).all()
    expected_ids = [it.id for it in items]

    audit = Audit(
        location_id=loc.id,
        started_by=current.id,
        include_sub=1 if payload.include_sub else 0,
        expected_json=json.dumps(expected_ids),
        found_json=json.dumps([]),
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    record(db, "audit", "started", f"Started shelf audit on '{loc.name}'", entity_id=audit.id, actor=current)
    db.commit()

    return AuditOut(
        id=audit.id,
        location_id=audit.location_id,
        started_by=audit.started_by,
        started_at=audit.started_at,
        finished_at=audit.finished_at,
        include_sub=bool(audit.include_sub),
        expected_count=len(expected_ids),
        found_count=0,
        summary=None
    )

@router.get("/audits/{audit_id}", response_model=AuditOut)
def get_audit(
    audit_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("audit:read"))
):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Audit not found"}})

    expected = json.loads(audit.expected_json) if audit.expected_json else []
    found = json.loads(audit.found_json) if audit.found_json else []
    summary_obj = json.loads(audit.summary_json) if audit.summary_json else None

    return AuditOut(
        id=audit.id,
        location_id=audit.location_id,
        started_by=audit.started_by,
        started_at=audit.started_at,
        finished_at=audit.finished_at,
        include_sub=bool(audit.include_sub),
        expected_count=len(expected),
        found_count=len(found),
        summary=AuditSummary(**summary_obj) if summary_obj else None
    )

@router.put("/audits/{audit_id}/found", response_model=AuditOut)
def update_found(
    audit_id: int,
    payload: AuditFoundRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("audit:write"))
):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Audit not found"}})
    if audit.finished_at:
        raise HTTPException(status_code=400, detail={"error": {"code": "AUDIT_FINISHED", "message": "Audit already finished"}})

    audit.found_json = json.dumps(payload.found_item_ids)
    db.commit()
    db.refresh(audit)

    expected = json.loads(audit.expected_json)
    return AuditOut(
        id=audit.id,
        location_id=audit.location_id,
        started_by=audit.started_by,
        started_at=audit.started_at,
        finished_at=audit.finished_at,
        include_sub=bool(audit.include_sub),
        expected_count=len(expected),
        found_count=len(payload.found_item_ids),
        summary=None
    )

@router.post("/audits/{audit_id}/finish", response_model=AuditOut)
def finish_audit(
    audit_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("audit:write"))
):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Audit not found"}})

    expected_ids = set(json.loads(audit.expected_json) if audit.expected_json else [])
    found_ids = set(json.loads(audit.found_json) if audit.found_json else [])

    # Identify items in packed boxes
    packed_box_item_ids = {
        r[0] for r in db.query(BoxItem.item_id).filter(BoxItem.item_id.in_(expected_ids), BoxItem.active == 1).all()
    }

    found_count = 0
    missing_items: List[AuditItemSummary] = []
    misplaced_items: List[AuditItemSummary] = []
    in_box_count = len(packed_box_item_ids)

    # Check expected items
    for item_id in expected_ids:
        item = db.query(Item).filter(Item.id == item_id).first()
        if not item:
            continue
        if item.id in packed_box_item_ids:
            continue  # Boxed items are never counted missing
        if item.id in found_ids:
            found_count += 1
        else:
            missing_items.append(AuditItemSummary(
                id=item.id,
                name=item.name,
                location_name=item.location.name if item.location else None,
                status="missing"
            ))
            # Marker note
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            marker = f"[Audit {today_str}: Not found]"
            if not item.notes or marker not in item.notes:
                item.notes = f"{item.notes}\n{marker}".strip() if item.notes else marker

    # Check scanned items not in expected
    for fid in found_ids:
        if fid not in expected_ids:
            item = db.query(Item).filter(Item.id == fid).first()
            if item:
                misplaced_items.append(AuditItemSummary(
                    id=item.id,
                    name=item.name,
                    location_name=item.location.name if item.location else "Unknown",
                    status="misplaced"
                ))

    summary = AuditSummary(
        found_count=found_count,
        missing_count=len(missing_items),
        misplaced_count=len(misplaced_items),
        in_box_count=in_box_count,
        missing_items=missing_items,
        misplaced_items=misplaced_items
    )

    audit.finished_at = datetime.now(timezone.utc).isoformat()
    audit.summary_json = summary.model_dump_json()
    db.commit()

    record(
        db, "audit", "finished",
        f"Completed audit: {found_count} found, {len(missing_items)} missing, {len(misplaced_items)} misplaced",
        entity_id=audit.id, actor=current
    )
    db.commit()

    return AuditOut(
        id=audit.id,
        location_id=audit.location_id,
        started_by=audit.started_by,
        started_at=audit.started_at,
        finished_at=audit.finished_at,
        include_sub=bool(audit.include_sub),
        expected_count=len(expected_ids),
        found_count=found_count,
        summary=summary
    )

@router.get("/locations/{location_id}/audits", response_model=List[AuditOut])
def get_location_audits(
    location_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("audit:read"))
):
    rows = db.query(Audit).filter(Audit.location_id == location_id).order_by(Audit.id.desc()).limit(20).all()
    results = []
    for a in rows:
        exp = json.loads(a.expected_json) if a.expected_json else []
        fnd = json.loads(a.found_json) if a.found_json else []
        summ = json.loads(a.summary_json) if a.summary_json else None
        results.append(AuditOut(
            id=a.id,
            location_id=a.location_id,
            started_by=a.started_by,
            started_at=a.started_at,
            finished_at=a.finished_at,
            include_sub=bool(a.include_sub),
            expected_count=len(exp),
            found_count=len(fnd),
            summary=AuditSummary(**summ) if summ else None
        ))
    return results
