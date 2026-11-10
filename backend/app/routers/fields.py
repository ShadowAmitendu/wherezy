import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Category, FieldDef
from backend.app.schemas import (
    FieldDefOut, FieldDefCreate, FieldDefUpdate, FieldReorderRequest, SuccessResponse
)
from backend.app.services.form_validator import generate_field_key
from backend.app.routers.categories import map_field

router = APIRouter(tags=["Fields"])

ALLOWED_TYPE_TRANSITIONS = {
    ("text", "longtext"),
    ("longtext", "text"),
    ("dropdown", "text"),
    ("text", "text"),
    ("longtext", "longtext"),
    ("number", "number"),
    ("date", "date"),
    ("dropdown", "dropdown"),
    ("multiselect", "multiselect"),
    ("checkbox", "checkbox"),
}

@router.get("/categories/{category_id}/fields", response_model=List[FieldDefOut])
def list_fields(category_id: int, include_archived: bool = False, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}})

    query = db.query(FieldDef).filter(FieldDef.category_id == category_id)
    if not include_archived:
        query = query.filter(FieldDef.archived == 0)
    fields = query.order_by(FieldDef.sort_order, FieldDef.id).all()
    return [map_field(f) for f in fields]

@router.post("/categories/{category_id}/fields", response_model=FieldDefOut)
def create_field(category_id: int, payload: FieldDefCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}})

    if payload.show_in_list:
        existing_show = db.query(FieldDef).filter(
            FieldDef.category_id == category_id,
            FieldDef.show_in_list == 1,
            FieldDef.archived == 0
        ).count()
        if existing_show >= 4:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "MAX_SHOW_IN_LIST", "message": "Maximum 4 fields can be shown in list view"}}
            )

    key = payload.key or generate_field_key()
    # ensure key uniqueness in category
    while db.query(FieldDef).filter(FieldDef.category_id == category_id, FieldDef.key == key).first():
        key = generate_field_key()

    max_sort = db.query(func.max(FieldDef.sort_order)).filter(FieldDef.category_id == category_id).scalar() or 0

    field = FieldDef(
        category_id=category_id,
        key=key,
        label=payload.label.strip(),
        type=payload.type,
        required=1 if payload.required else 0,
        options_json=json.dumps(payload.options) if payload.options is not None else None,
        unit=payload.unit.strip() if payload.unit else None,
        hint=payload.hint.strip() if payload.hint else None,
        sort_order=max_sort + 1,
        show_in_list=1 if payload.show_in_list else 0,
        archived=0
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return map_field(field)

@router.put("/fields/{field_id}", response_model=FieldDefOut)
def update_field(field_id: int, payload: FieldDefUpdate, db: Session = Depends(get_db)):
    field = db.query(FieldDef).filter(FieldDef.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Field not found"}})

    if payload.type is not None and payload.type != field.type:
        transition = (field.type, payload.type)
        if transition not in ALLOWED_TYPE_TRANSITIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INCOMPATIBLE_TYPE_CHANGE",
                        "message": f"Cannot change type from '{field.type}' to '{payload.type}'. Archive this field and create a new one instead."
                    }
                }
            )
        field.type = payload.type

    if payload.label is not None:
        field.label = payload.label.strip()
    if payload.required is not None:
        field.required = 1 if payload.required else 0
    if payload.options is not None:
        field.options_json = json.dumps(payload.options)
    if payload.unit is not None:
        field.unit = payload.unit.strip() if payload.unit else None
    if payload.hint is not None:
        field.hint = payload.hint.strip() if payload.hint else None
    if payload.show_in_list is not None:
        if payload.show_in_list and not field.show_in_list:
            existing_show = db.query(FieldDef).filter(
                FieldDef.category_id == field.category_id,
                FieldDef.show_in_list == 1,
                FieldDef.archived == 0,
                FieldDef.id != field.id
            ).count()
            if existing_show >= 4:
                raise HTTPException(
                    status_code=400,
                    detail={"error": {"code": "MAX_SHOW_IN_LIST", "message": "Maximum 4 fields can be shown in list view"}}
                )
        field.show_in_list = 1 if payload.show_in_list else 0
    if payload.archived is not None:
        field.archived = 1 if payload.archived else 0
    if payload.sort_order is not None:
        field.sort_order = payload.sort_order

    db.commit()
    db.refresh(field)
    return map_field(field)

@router.delete("/fields/{field_id}", response_model=SuccessResponse)
def archive_field(field_id: int, db: Session = Depends(get_db)):
    field = db.query(FieldDef).filter(FieldDef.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Field not found"}})

    field.archived = 1
    field.show_in_list = 0
    db.commit()
    return SuccessResponse(ok=True, message=f"Field '{field.label}' archived")

@router.post("/categories/{category_id}/fields/reorder", response_model=SuccessResponse)
def reorder_fields(category_id: int, payload: FieldReorderRequest, db: Session = Depends(get_db)):
    for order, f_id in enumerate(payload.field_ids, start=1):
        field = db.query(FieldDef).filter(FieldDef.id == f_id, FieldDef.category_id == category_id).first()
        if field:
            field.sort_order = order
    db.commit()
    return SuccessResponse(ok=True, message="Fields reordered successfully")
