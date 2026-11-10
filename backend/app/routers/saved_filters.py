from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import SavedFilter, Profile
from backend.app.schemas import SavedFilterOut, SavedFilterCreate, SuccessResponse
from backend.app.services.permissions import require

router = APIRouter(prefix="/saved-filters", tags=["Saved Filters"])

@router.get("", response_model=List[SavedFilterOut])
def list_saved_filters(db: Session = Depends(get_db), current: Profile = Depends(require("viewer"))):
    rows = db.query(SavedFilter).filter(
        (SavedFilter.profile_id == current.id) | (SavedFilter.profile_id.is_(None))
    ).order_by(SavedFilter.id.desc()).all()

    return [
        SavedFilterOut(
            id=r.id,
            profile_id=r.profile_id,
            name=r.name,
            scope=r.scope,
            query_json=r.query_json,
            created_at=r.created_at
        )
        for r in rows
    ]

@router.post("", response_model=SavedFilterOut)
def create_saved_filter(
    payload: SavedFilterCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    filt = SavedFilter(
        profile_id=current.id,
        name=payload.name.strip(),
        scope=payload.scope,
        query_json=payload.query_json
    )
    db.add(filt)
    db.commit()
    db.refresh(filt)

    return SavedFilterOut(
        id=filt.id,
        profile_id=filt.profile_id,
        name=filt.name,
        scope=filt.scope,
        query_json=filt.query_json,
        created_at=filt.created_at
    )

@router.delete("/{filter_id}", response_model=SuccessResponse)
def delete_saved_filter(
    filter_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    filt = db.query(SavedFilter).filter(SavedFilter.id == filter_id).first()
    if not filt:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Saved filter not found"}})

    if filt.profile_id is not None and filt.profile_id != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Cannot delete another person's saved filter"}})

    db.delete(filt)
    db.commit()
    return SuccessResponse(ok=True, message="Saved filter deleted")
