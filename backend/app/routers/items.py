import json
import uuid
from datetime import date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from backend.app.core.db import get_db
from backend.app.models import Item, Category, Location, Tag, Profile
from backend.app.schemas import (
    ItemCreate, ItemUpdate, ItemMoveRequest, ItemTakenRequest,
    BulkMoveRequest, BulkMoveResponse, BulkCreateRequest, BulkCreateResponse,
    BulkRequest, ItemsListResponse, ItemDetailOut, ItemOut, SuccessResponse
)
from backend.app.routers.settings import get_setting_val
from backend.app.services.item_service import map_item, map_item_detail, parse_item_code
from backend.app.services.location_service import get_descendant_location_ids
from backend.app.models import utc_now_iso
from backend.app.services.visibility import items_visible
from backend.app.services.permissions import require
from backend.app.services.activity import record
from backend.app.services.bulk import execute_bulk

router = APIRouter(tags=["Items"])

def validate_values(category: Category, values_dict: Optional[dict]) -> dict:
    if not values_dict:
        values_dict = {}
    cleaned = {}
    for f in category.fields:
        if f.archived:
            continue
        val = values_dict.get(f.key)
        if f.required and (val is None or val == "" or val == []):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"error": {"code": "VALIDATION_ERROR", "message": f"Field '{f.label}' is required", "fields": {f.key: "Required"}}}
            )
        if val is not None and val != "":
            if f.type == "number":
                try:
                    val = float(val) if "." in str(val) else int(val)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail={"error": {"code": "VALIDATION_ERROR", "message": f"Field '{f.label}' must be a number", "fields": {f.key: "Must be a number"}}}
                    )
            cleaned[f.key] = val
    return cleaned

@router.get("/items", response_model=ItemsListResponse)
def list_items(
    request: Request,
    q: Optional[str] = None,
    category_id: Optional[int] = None,
    location_id: Optional[int] = None,
    include_sub: bool = False,
    taken_out: Optional[bool] = None,
    expiry_status: Optional[str] = None,
    expiry_before: Optional[str] = None,
    status_filter: str = Query("active", alias="status"),
    tags: Optional[str] = None,
    tag_mode: str = Query("any"),
    sort: str = "created_at",
    order: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))

    if status_filter == "retired":
        query = db.query(Item).filter(Item.status == "retired", Item.deleted_at.is_(None))
    elif status_filter == "inbox":
        query = db.query(Item).filter(Item.status == "inbox", Item.deleted_at.is_(None))
    else:
        # Default active visible items
        query = items_visible(db)

    if category_id:
        query = query.filter(Item.category_id == category_id)

    if location_id:
        if include_sub:
            loc_ids = get_descendant_location_ids(db, location_id)
            query = query.filter(Item.location_id.in_(loc_ids))
        else:
            query = query.filter(Item.location_id == location_id)

    if taken_out is not None:
        query = query.filter(Item.taken_out == (1 if taken_out else 0))

    today_str = date.today().isoformat()
    warn_date_str = (date.today() + timedelta(days=warn_days)).isoformat()

    if expiry_status:
        if expiry_status == "expired":
            query = query.filter(Item.expiry_date.isnot(None), Item.expiry_date < today_str)
        elif expiry_status == "soon":
            query = query.filter(
                Item.expiry_date.isnot(None),
                Item.expiry_date >= today_str,
                Item.expiry_date <= warn_date_str
            )
        elif expiry_status == "ok":
            query = query.filter(Item.expiry_date.isnot(None), Item.expiry_date > warn_date_str)
        elif expiry_status == "none":
            query = query.filter(or_(Item.expiry_date.is_(None), Item.expiry_date == ""))

    if expiry_before:
        query = query.filter(Item.expiry_date.isnot(None), Item.expiry_date <= expiry_before)

    # Tag filter
    if tags:
        tag_id_list = [int(t.strip()) for t in tags.split(",") if t.strip().isdigit()]
        if tag_id_list:
            if tag_mode == "all":
                for tid in tag_id_list:
                    query = query.filter(Item.tags.any(Tag.id == tid))
            else:
                query = query.filter(Item.tags.any(Tag.id.in_(tag_id_list)))

    # Search filter
    if q and q.strip():
        term = f"%{q.strip()}%"
        code_id = parse_item_code(q)
        search_filters = [
            Item.name.ilike(term),
            Item.notes.ilike(term),
            Location.name.ilike(term),
            Category.name.ilike(term),
            Item.values_json.ilike(term),
        ]
        if code_id is not None:
            search_filters.append(Item.id == code_id)
        query = query.outerjoin(Location, Item.location_id == Location.id).outerjoin(Category, Item.category_id == Category.id).filter(
            or_(*search_filters)
        )

    # Custom field filters: f.<fieldKey>=value
    for param_key, param_val in request.query_params.items():
        if param_key.startswith("f.") and param_val:
            field_key = param_key[2:]
            search_str = f'%"{field_key}":%{param_val}%'
            query = query.filter(Item.values_json.like(search_str))

    total = query.count()

    # Sorting
    if sort == "name":
        col = Item.name
    elif sort == "quantity":
        col = Item.quantity
    elif sort == "expiry_date":
        col = Item.expiry_date
    elif sort == "updated_at":
        col = Item.updated_at
    else:
        col = Item.created_at

    if order.lower() == "asc":
        query = query.order_by(col.asc(), Item.id.asc())
    else:
        query = query.order_by(col.desc(), Item.id.desc())

    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1

    return ItemsListResponse(
        items=[map_item(it, db, warn_days) for it in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@router.post("/items", response_model=ItemDetailOut)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:write"))
):
    category = db.query(Category).filter(Category.id == payload.category_id, Category.deleted_at.is_(None)).first()
    if not category:
        raise HTTPException(status_code=404, detail={"error": {"code": "CATEGORY_NOT_FOUND", "message": "Category not found"}})

    if payload.location_id:
        loc = db.query(Location).filter(Location.id == payload.location_id, Location.deleted_at.is_(None)).first()
        if not loc:
            raise HTTPException(status_code=404, detail={"error": {"code": "LOCATION_NOT_FOUND", "message": "Location not found"}})

    validated_vals = validate_values(category, payload.values)

    item = Item(
        name=payload.name.strip(),
        category_id=payload.category_id,
        location_id=payload.location_id,
        quantity=payload.quantity,
        taken_out=0,
        taken_out_quantity=0,
        expiry_date=payload.expiry_date.strip() if (payload.expiry_date and category.track_expiry) else None,
        notes=payload.notes.strip() if payload.notes else None,
        values_json=json.dumps(validated_vals),
        status="active"
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    record(db, "item", "created", f"Created item '{item.name}'", entity_id=item.id, actor=current)
    db.commit()

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return map_item_detail(item, db, warn_days)

@router.get("/items/{id}", response_model=ItemDetailOut)
def get_item(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    item = db.query(Item).filter(Item.id == id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})
    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return map_item_detail(item, db, warn_days)

@router.put("/items/{id}", response_model=ItemDetailOut)
def update_item(
    id: int,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:write"))
):
    item = db.query(Item).filter(Item.id == id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    target_category_id = payload.category_id if payload.category_id is not None else item.category_id
    category = db.query(Category).filter(Category.id == target_category_id, Category.deleted_at.is_(None)).first()
    if not category:
        raise HTTPException(status_code=404, detail={"error": {"code": "CATEGORY_NOT_FOUND", "message": "Category not found"}})

    old_loc = item.location_id
    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.category_id is not None:
        item.category_id = payload.category_id
    if payload.location_id is not None:
        if payload.location_id != 0:
            loc = db.query(Location).filter(Location.id == payload.location_id, Location.deleted_at.is_(None)).first()
            if not loc:
                raise HTTPException(status_code=404, detail={"error": {"code": "LOCATION_NOT_FOUND", "message": "Location not found"}})
            item.location_id = payload.location_id
        else:
            item.location_id = None

    if payload.expiry_date is not None:
        item.expiry_date = payload.expiry_date.strip() if (payload.expiry_date and category.track_expiry) else None

    if payload.quantity is not None:
        current_out_qty = int(item.taken_out_quantity) if item.taken_out_quantity is not None else (1 if item.taken_out else 0)
        if payload.quantity < current_out_qty:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": f"Quantity ({payload.quantity}) cannot be less than currently taken out count ({current_out_qty})",
                    }
                },
            )
        item.quantity = payload.quantity

    if payload.notes is not None:
        item.notes = payload.notes.strip() if payload.notes else None

    if payload.values is not None:
        clean_vals = validate_values(category, payload.values)
        item.values_json = json.dumps(clean_vals)

    item.updated_at = utc_now_iso()
    db.commit()
    db.refresh(item)

    record(db, "item", "updated", f"Updated item '{item.name}'", entity_id=item.id, actor=current)
    db.commit()

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return map_item_detail(item, db, warn_days)

@router.delete("/items/{id}", response_model=SuccessResponse)
def delete_item(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:delete"))
):
    item = db.query(Item).filter(Item.id == id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})
    item.deleted_at = utc_now_iso()
    item.deleted_by = current.id
    db.commit()

    record(db, "item", "deleted", f"Moved '{item.name}' to trash", entity_id=item.id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Item '{item.name}' deleted")

@router.post("/items/{id}/restore", response_model=ItemDetailOut)
def restore_item(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("trash:restore"))
):
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})
    item.deleted_at = None
    item.deleted_by = None
    item.updated_at = utc_now_iso()
    db.commit()
    db.refresh(item)

    record(db, "item", "restored", f"Restored item '{item.name}'", entity_id=item.id, actor=current)
    db.commit()

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return map_item_detail(item, db, warn_days)

@router.post("/items/{id}/duplicate", response_model=ItemDetailOut)
def duplicate_item(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:write"))
):
    item = db.query(Item).filter(Item.id == id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    new_item = Item(
        name=f"{item.name} (Copy)",
        category_id=item.category_id,
        location_id=item.location_id,
        quantity=max(1, int(item.quantity or 1)),
        taken_out=0,
        taken_out_quantity=0,
        taken_by=None,
        taken_at=None,
        expiry_date=item.expiry_date,
        notes=item.notes,
        values_json=item.values_json,
        status="active"
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    record(db, "item", "created", f"Duplicated '{item.name}' as '{new_item.name}'", entity_id=new_item.id, actor=current)
    db.commit()

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return map_item_detail(new_item, db, warn_days)

@router.post("/items/{id}/move", response_model=ItemDetailOut)
def move_item(
    id: int,
    payload: ItemMoveRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:write"))
):
    item = db.query(Item).filter(Item.id == id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    old_loc = item.location_id
    if payload.location_id:
        loc = db.query(Location).filter(Location.id == payload.location_id, Location.deleted_at.is_(None)).first()
        if not loc:
            raise HTTPException(status_code=404, detail={"error": {"code": "LOCATION_NOT_FOUND", "message": "Location not found"}})
        item.location_id = payload.location_id
    else:
        item.location_id = None

    item.updated_at = utc_now_iso()
    db.commit()
    db.refresh(item)

    record(
        db, "item", "moved",
        f"Moved '{item.name}' to location #{payload.location_id}",
        entity_id=item.id, actor=current,
        diff={"location_id": [old_loc, payload.location_id]}
    )
    db.commit()

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return map_item_detail(item, db, warn_days)

@router.post("/items/{id}/taken", response_model=ItemDetailOut)
def toggle_taken_item(
    id: int,
    payload: ItemTakenRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:write"))
):
    item = db.query(Item).filter(Item.id == id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    total_qty = max(1, int(item.quantity or 1))
    old_taken = int(item.taken_out or 0)
    old_taken_qty = int(item.taken_out_quantity) if item.taken_out_quantity is not None else old_taken

    if payload.taken_out is False and payload.taken_out_quantity is not None and payload.taken_out_quantity > 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "Cannot set taken_out=false with taken_out_quantity > 0"}}
        )
    if payload.taken_out is None and payload.taken_out_quantity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "Specify taken_out or taken_out_quantity"}}
        )

    if payload.taken_out_quantity is not None:
        if payload.taken_out_quantity > total_qty:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"error": {"code": "EXCEEDS_QUANTITY", "message": f"Cannot take out {payload.taken_out_quantity} units; total quantity is {total_qty}"}}
            )
        new_taken_qty = payload.taken_out_quantity
    elif payload.taken_out:
        new_taken_qty = old_taken_qty if old_taken_qty > 0 else 1
    else:
        new_taken_qty = 0

    item.taken_out_quantity = new_taken_qty
    item.taken_out = 1 if new_taken_qty > 0 else 0
    if new_taken_qty > 0:
        if "taken_by" in payload.model_fields_set:
            item.taken_by = payload.taken_by.strip() if payload.taken_by else None
        elif old_taken == 0:
            item.taken_by = None
        if "taken_due" in payload.model_fields_set:
            item.taken_due = payload.taken_due
        elif old_taken == 0:
            item.taken_due = None
        if "taken_by_profile_id" in payload.model_fields_set:
            item.taken_by_profile_id = payload.taken_by_profile_id
        elif old_taken == 0:
            item.taken_by_profile_id = None
        if "taken_by_contact_id" in payload.model_fields_set:
            item.taken_by_contact_id = payload.taken_by_contact_id
        elif old_taken == 0:
            item.taken_by_contact_id = None
        if old_taken == 0 or not item.taken_at:
            item.taken_at = utc_now_iso()
    else:
        item.taken_by = None
        item.taken_due = None
        item.taken_by_profile_id = None
        item.taken_by_contact_id = None
        item.taken_at = None

    item.updated_at = utc_now_iso()
    db.commit()
    db.refresh(item)

    action_name = "taken_out" if new_taken_qty > 0 else "returned"
    qty_note = f" ({new_taken_qty}/{total_qty})" if total_qty > 1 and new_taken_qty > 0 else ""
    record(
        db, "item", action_name,
        f"{'Lent out' if new_taken_qty > 0 else 'Returned'} '{item.name}'{qty_note}",
        entity_id=item.id, actor=current,
        diff={"taken_out": [old_taken, item.taken_out], "taken_out_quantity": [old_taken_qty, item.taken_out_quantity]}
    )
    db.commit()

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return map_item_detail(item, db, warn_days)

@router.post("/items/bulk-move", response_model=BulkMoveResponse)
def bulk_move_items(
    payload: BulkMoveRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("bulk:write"))
):
    result = execute_bulk(
        db,
        BulkRequest(ids=payload.item_ids, action="move", params={"location_id": payload.location_id}),
        actor=current,
    )
    return BulkMoveResponse(ok=True, moved_count=result.changed, batch_id=result.batch_id)


@router.post("/items/bulk-create", response_model=BulkCreateResponse)
def bulk_create_items(
    payload: BulkCreateRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("bulk:write"))
):
    if not payload.items:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "At least one item is required"}},
        )
    if len(payload.items) > 500:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "Maximum 500 items per bulk request"}},
        )

    category = db.query(Category).filter(Category.id == payload.category_id, Category.deleted_at.is_(None)).first()
    if not category:
        raise HTTPException(status_code=404, detail={"error": {"code": "CATEGORY_NOT_FOUND", "message": "Category not found"}})

    loc_ids = set()
    if payload.location_id is not None and payload.location_id != 0:
        loc_ids.add(payload.location_id)
    for entry in payload.items:
        if entry.location_id is not None and entry.location_id != 0:
            loc_ids.add(entry.location_id)

    if loc_ids:
        existing_loc_ids = {
            lid for (lid,) in db.query(Location.id).filter(Location.id.in_(loc_ids), Location.deleted_at.is_(None)).all()
        }
        if not loc_ids.issubset(existing_loc_ids):
            raise HTTPException(status_code=404, detail={"error": {"code": "LOCATION_NOT_FOUND", "message": "Location not found"}})

    prepared: List[dict] = []
    for idx, entry in enumerate(payload.items):
        clean_name = entry.name.strip()
        if not clean_name:
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "VALIDATION_ERROR", "message": f"Item #{idx + 1} name cannot be empty"}},
            )
        target_loc_id = entry.location_id if entry.location_id is not None else payload.location_id
        if target_loc_id == 0:
            target_loc_id = None

        raw_expiry = entry.expiry_date if entry.expiry_date is not None else payload.expiry_date
        clean_expiry = raw_expiry.strip() if (raw_expiry and raw_expiry.strip() and category.track_expiry) else None

        raw_notes = entry.notes if entry.notes is not None else payload.notes
        clean_notes = raw_notes.strip() if (raw_notes and raw_notes.strip()) else None

        merged_values = {**payload.values, **(entry.values or {})}
        clean_vals = validate_values(category, merged_values)

        entry_qty = entry.quantity if entry.quantity is not None else payload.quantity

        prepared.append({
            "name": clean_name,
            "category_id": payload.category_id,
            "location_id": target_loc_id,
            "quantity": entry_qty,
            "taken_out": 0,
            "taken_out_quantity": 0,
            "expiry_date": clean_expiry,
            "notes": clean_notes,
            "values_json": json.dumps(clean_vals),
            "status": "active",
        })

    batch_id = str(uuid.uuid4())
    now = utc_now_iso()
    created_items: List[Item] = []
    for row in prepared:
        item = Item(**row, created_at=now, updated_at=now)
        db.add(item)
        created_items.append(item)

    db.flush()
    for item in created_items:
        record(
            db, "item", "created",
            f"Bulk added '{item.name}' in '{category.name}'",
            entity_id=item.id, actor=current, batch_id=batch_id
        )

    db.commit()
    for item in created_items:
        db.refresh(item)

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return BulkCreateResponse(
        ok=True,
        created_count=len(created_items),
        batch_id=batch_id,
        items=[map_item_detail(item, db, warn_days) for item in created_items],
    )

@router.get("/locations/{id}/items", response_model=List[ItemOut])
def get_location_items(
    id: int,
    include_sub: bool = True,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    if include_sub:
        loc_ids = get_descendant_location_ids(db, id)
        items = items_visible(db).filter(Item.location_id.in_(loc_ids)).order_by(Item.name).all()
    else:
        items = items_visible(db).filter(Item.location_id == id).order_by(Item.name).all()
    return [map_item(it, db, warn_days) for it in items]

@router.get("/expiring", response_model=List[ItemOut])
def get_expiring_items(
    within_days: Optional[int] = None,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:read"))
):
    warn_days = within_days if within_days is not None else int(get_setting_val(db, "expiry_warn_days", 30))
    warn_date_str = (date.today() + timedelta(days=warn_days)).isoformat()

    items = (
        items_visible(db)
        .filter(
            Item.expiry_date.isnot(None),
            Item.expiry_date != "",
            Item.expiry_date <= warn_date_str
        )
        .order_by(Item.expiry_date.asc())
        .all()
    )
    return [map_item(it, db, warn_days) for it in items]
