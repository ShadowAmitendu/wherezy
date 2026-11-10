from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Activity, Profile
from backend.app.schemas import ActivityOut, ActivityListResponse, ActivityRevertResponse
from backend.app.services.permissions import require
from backend.app.services.activity import revert_activity

router = APIRouter(tags=["Activity"])

def _to_out(act: Activity) -> ActivityOut:
    return ActivityOut(
        id=act.id,
        at=act.at,
        actor_id=act.actor_id,
        actor_name=act.actor.name if act.actor else None,
        batch_id=act.batch_id,
        entity_type=act.entity_type,
        entity_id=act.entity_id,
        action=act.action,
        summary=act.summary,
        diff_json=act.diff_json,
    )

@router.get("/activity", response_model=ActivityListResponse)
def get_global_activity(
    actor_id: Optional[int] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    batch_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    cursor: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    query = db.query(Activity)

    if actor_id is not None:
        query = query.filter(Activity.actor_id == actor_id)
    if entity_type:
        query = query.filter(Activity.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(Activity.entity_id == entity_id)
    if action:
        query = query.filter(Activity.action == action)
    if from_date:
        query = query.filter(Activity.at >= from_date)
    if to_date:
        query = query.filter(Activity.at <= to_date)
    if batch_id:
        query = query.filter(Activity.batch_id == batch_id)
    if q:
        query = query.filter(Activity.summary.ilike(f"%{q.strip()}%"))

    total = query.count()

    if cursor is not None:
        query = query.filter(Activity.id < cursor)

    rows = query.order_by(Activity.id.desc()).limit(limit).all()
    next_cur = rows[-1].id if len(rows) == limit else None

    return ActivityListResponse(
        items=[_to_out(r) for r in rows],
        total=total,
        next_cursor=next_cur
    )

@router.get("/items/{item_id}/activity", response_model=List[ActivityOut])
def get_item_activity(
    item_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    rows = (
        db.query(Activity)
        .filter(Activity.entity_type == "item", Activity.entity_id == item_id)
        .order_by(Activity.id.desc())
        .limit(limit)
        .all()
    )
    return [_to_out(r) for r in rows]

@router.get("/locations/{location_id}/activity", response_model=List[ActivityOut])
def get_location_activity(
    location_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    rows = (
        db.query(Activity)
        .filter(Activity.entity_type == "location", Activity.entity_id == location_id)
        .order_by(Activity.id.desc())
        .limit(limit)
        .all()
    )
    return [_to_out(r) for r in rows]

@router.post("/activity/{activity_id}/revert", response_model=ActivityRevertResponse)
def revert_event(
    activity_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    try:
        new_act = revert_activity(db=db, activity_id=activity_id, actor=current)
        db.commit()
        return ActivityRevertResponse(ok=True, reverted_id=activity_id, new_activity_id=new_act.id)
    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "REVERT_FAILED", "message": str(e)}}
        )
