from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Move, Box, BoxItem, Item, Location, Profile
from backend.app.schemas import (
    MoveOut, MoveCreate, MoveUpdate, BoxOut, BoxCreate, BoxUpdate,
    BoxItemOut, BoxUnpackRequest, SuccessResponse
)
from backend.app.services.permissions import require
from backend.app.services.activity import record
from backend.app.services.visibility import items_visible
from backend.app.services.bulk import execute_bulk
from backend.app.schemas import BulkRequest

router = APIRouter(tags=["Moving-House Mode"])

def _move_to_out(m: Move, db: Session) -> MoveOut:
    boxes = db.query(Box).filter(Box.move_id == m.id).all()
    box_ids = [b.id for b in boxes]
    packed_boxes = sum(1 for b in boxes if b.status in ("packed", "unpacked"))

    # Active items in this move's boxes
    packed_items_count = db.query(BoxItem).filter(BoxItem.box_id.in_(box_ids), BoxItem.active == 1).count() if box_ids else 0
    total_active_items = items_visible(db).count()

    return MoveOut(
        id=m.id,
        name=m.name,
        target_date=m.target_date,
        status=m.status,
        created_by=m.created_by,
        created_at=m.created_at,
        finished_at=m.finished_at,
        box_count=len(boxes),
        packed_box_count=packed_boxes,
        total_items=total_active_items,
        packed_items=packed_items_count
    )

def _box_to_out(b: Box, db: Session) -> BoxOut:
    box_items = (
        db.query(Item)
        .join(BoxItem, BoxItem.item_id == Item.id)
        .filter(BoxItem.box_id == b.id, BoxItem.active == 1)
        .all()
    )
    item_outs = [
        BoxItemOut(
            id=it.id,
            name=it.name,
            category_name=it.category.name if it.category else None,
            location_path=it.location.name if it.location else None
        )
        for it in box_items
    ]
    dest_loc = db.query(Location).filter(Location.id == b.destination_location_id).first() if b.destination_location_id else None

    return BoxOut(
        id=b.id,
        move_id=b.move_id,
        number=b.number,
        label=b.label,
        destination=b.destination,
        destination_location_id=b.destination_location_id,
        destination_location_name=dest_loc.name if dest_loc else None,
        colour=b.colour,
        notes=b.notes,
        status=b.status,
        items_count=len(item_outs),
        items=item_outs
    )

@router.get("/moves", response_model=List[MoveOut])
def list_moves(db: Session = Depends(get_db), current: Profile = Depends(require("viewer"))):
    moves = db.query(Move).order_by(Move.id.desc()).all()
    return [_move_to_out(m, db) for m in moves]

@router.post("/moves", response_model=MoveOut)
def create_move(
    payload: MoveCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    # Enforce one active move at a time
    active = db.query(Move).filter(Move.status == "planning").first()
    if active:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "ACTIVE_MOVE_EXISTS", "message": f"Move '{active.name}' is currently active. Finish it before starting a new one."}}
        )

    move = Move(
        name=payload.name.strip(),
        target_date=payload.target_date,
        status="planning",
        created_by=current.id
    )
    db.add(move)
    db.commit()
    db.refresh(move)

    record(db, "move", "created", f"Started move '{move.name}'", entity_id=move.id, actor=current)
    db.commit()

    return _move_to_out(move, db)

@router.put("/moves/{move_id}", response_model=MoveOut)
def update_move(
    move_id: int,
    payload: MoveUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    move = db.query(Move).filter(Move.id == move_id).first()
    if not move:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Move not found"}})

    if payload.name is not None:
        move.name = payload.name.strip()
    if payload.target_date is not None:
        move.target_date = payload.target_date
    if payload.status is not None:
        move.status = payload.status
        if payload.status == "done":
            move.finished_at = datetime.now(timezone.utc).isoformat()

    db.commit()
    db.refresh(move)

    record(db, "move", "updated", f"Updated move '{move.name}'", entity_id=move.id, actor=current)
    db.commit()

    return _move_to_out(move, db)

@router.post("/moves/{move_id}/finish", response_model=MoveOut)
def finish_move(
    move_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    move = db.query(Move).filter(Move.id == move_id).first()
    if not move:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Move not found"}})

    move.status = "done"
    move.finished_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(move)

    record(db, "move", "finished", f"Finished move '{move.name}'", entity_id=move.id, actor=current)
    db.commit()

    return _move_to_out(move, db)

# --- Boxes ---

@router.get("/moves/{move_id}/boxes", response_model=List[BoxOut])
def list_boxes(move_id: int, db: Session = Depends(get_db), current: Profile = Depends(require("viewer"))):
    boxes = db.query(Box).filter(Box.move_id == move_id).order_by(Box.number).all()
    return [_box_to_out(b, db) for b in boxes]

@router.post("/moves/{move_id}/boxes", response_model=BoxOut)
def create_box(
    move_id: int,
    payload: BoxCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    move = db.query(Move).filter(Move.id == move_id).first()
    if not move:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Move not found"}})

    # Auto number if not specified
    if not payload.number:
        max_num = db.query(func.max(Box.number)).filter(Box.move_id == move.id).scalar() or 0
        box_number = max_num + 1
    else:
        box_number = payload.number

    box = Box(
        move_id=move.id,
        number=box_number,
        label=payload.label.strip(),
        destination=payload.destination,
        destination_location_id=payload.destination_location_id,
        colour=payload.colour,
        notes=payload.notes,
        status="packing"
    )
    db.add(box)
    db.commit()
    db.refresh(box)

    record(db, "box", "created", f"Created Box #{box.number} ('{box.label}') in move '{move.name}'", entity_id=box.id, actor=current)
    db.commit()

    return _box_to_out(box, db)

@router.get("/boxes/{box_id}", response_model=BoxOut)
def get_box(box_id: int, db: Session = Depends(get_db), current: Profile = Depends(require("viewer"))):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Box not found"}})
    return _box_to_out(box, db)

@router.put("/boxes/{box_id}", response_model=BoxOut)
def update_box(
    box_id: int,
    payload: BoxUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Box not found"}})

    if payload.label is not None:
        box.label = payload.label.strip()
    if payload.destination is not None:
        box.destination = payload.destination
    if payload.destination_location_id is not None:
        box.destination_location_id = payload.destination_location_id
    if payload.colour is not None:
        box.colour = payload.colour
    if payload.notes is not None:
        box.notes = payload.notes
    if payload.status is not None:
        box.status = payload.status

    db.commit()
    db.refresh(box)

    record(db, "box", "updated", f"Updated Box #{box.number} ('{box.label}')", entity_id=box.id, actor=current)
    db.commit()

    return _box_to_out(box, db)

@router.delete("/boxes/{box_id}", response_model=SuccessResponse)
def delete_box(box_id: int, db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Box not found"}})

    num = box.number
    db.delete(box)
    db.commit()

    record(db, "box", "deleted", f"Deleted Box #{num}", entity_id=box_id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Box #{num} deleted")

@router.post("/boxes/{box_id}/items", response_model=SuccessResponse)
def add_items_to_box(
    box_id: int,
    item_ids: List[int],
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Box not found"}})

    added_count = 0
    for iid in item_ids:
        # Enforce one active box per item
        existing = db.query(BoxItem).filter(BoxItem.item_id == iid, BoxItem.active == 1).first()
        if existing:
            if existing.box_id == box.id:
                continue
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "ITEM_ALREADY_PACKED", "message": f"Item #{iid} is already packed in box #{existing.box_id}"}}
            )

        db.add(BoxItem(box_id=box.id, item_id=iid, active=1))
        added_count += 1

    db.commit()
    record(db, "box", "packed", f"Packed {added_count} items into Box #{box.number}", entity_id=box.id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Added {added_count} items to Box #{box.number}")

@router.delete("/boxes/{box_id}/items/{item_id}", response_model=SuccessResponse)
def remove_item_from_box(
    box_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    bitem = db.query(BoxItem).filter(BoxItem.box_id == box_id, BoxItem.item_id == item_id).first()
    if not bitem:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not in this box"}})

    db.delete(bitem)
    db.commit()
    return SuccessResponse(ok=True, message="Item removed from box")

@router.post("/boxes/{box_id}/pack", response_model=SuccessResponse)
def pack_box(box_id: int, db: Session = Depends(get_db), current: Profile = Depends(require("member"))):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Box not found"}})
    box.status = "packed"
    db.commit()
    record(db, "box", "packed", f"Marked Box #{box.number} as packed", entity_id=box.id, actor=current)
    db.commit()
    return SuccessResponse(ok=True, message=f"Box #{box.number} marked as packed")

@router.post("/boxes/{box_id}/unpack", response_model=SuccessResponse)
def unpack_box(
    box_id: int,
    payload: BoxUnpackRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Box not found"}})

    dest_loc = db.query(Location).filter(Location.id == payload.location_id, Location.deleted_at.is_(None)).first()
    if not dest_loc:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_LOCATION", "message": "Destination location not found"}})

    # Bulk move items to dest_loc via execute_bulk (one undoable batch)
    bulk_res = execute_bulk(
        db=db,
        req=BulkRequest(ids=payload.item_ids, action="move", params={"location_id": dest_loc.id}),
        actor=current
    )

    # Deactivate box_items
    db.query(BoxItem).filter(BoxItem.box_id == box.id, BoxItem.item_id.in_(payload.item_ids)).update({"active": 0}, synchronize_session=False)

    # Check if box is empty
    remaining = db.query(BoxItem).filter(BoxItem.box_id == box.id, BoxItem.active == 1).count()
    if remaining == 0:
        box.status = "unpacked"

    db.commit()

    record(
        db, "box", "unpacked",
        f"Unpacked {bulk_res.changed} items from Box #{box.number} to '{dest_loc.name}'",
        entity_id=box.id, actor=current, batch_id=bulk_res.batch_id
    )
    db.commit()

    return SuccessResponse(ok=True, message=f"Unpacked {bulk_res.changed} items to {dest_loc.name}")
