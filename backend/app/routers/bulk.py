from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Profile
from backend.app.schemas import BulkRequest, BulkResponse, BatchUndoResponse
from backend.app.services.permissions import require
from backend.app.services.bulk import execute_bulk, undo_batch

router = APIRouter(tags=["Bulk Operations"])

@router.post("/items/bulk", response_model=BulkResponse)
def bulk_items_operation(
    payload: BulkRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    """Execute bulk operations on items (move, tags, taken-out, expiry, retire, box, delete)."""
    return execute_bulk(db, payload, actor=current)

@router.post("/items/bulk/preview", response_model=BulkResponse)
def bulk_items_preview(
    payload: BulkRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    """Dry-run preview of bulk operations before confirmation."""
    payload.dry_run = True
    return execute_bulk(db, payload, actor=current)

@router.post("/batches/{batch_id}/undo", response_model=BatchUndoResponse)
def undo_batch_endpoint(
    batch_id: str,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    """Replay inverse operations to undo a batch."""
    try:
        return undo_batch(db, batch_id, actor=current)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "UNDO_FAILED", "message": str(e)}}
        )
