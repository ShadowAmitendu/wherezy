import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Category, Item, FieldDef, Profile, utc_now_iso
from backend.app.schemas import (
    CategoryOut, CategoryDetailOut, CategoryCreate, CategoryUpdate,
    FieldDefOut, SuccessResponse
)
from backend.app.services.permissions import require

router = APIRouter(prefix="/categories", tags=["Categories"])

def map_field(f: FieldDef) -> FieldDefOut:
    options = None
    if f.options_json:
        try:
            options = json.loads(f.options_json)
        except Exception:
            options = None
    return FieldDefOut(
        id=f.id,
        category_id=f.category_id,
        key=f.key,
        label=f.label,
        type=f.type,
        required=bool(f.required),
        options=options,
        unit=f.unit,
        hint=f.hint,
        sort_order=f.sort_order,
        show_in_list=bool(f.show_in_list),
        archived=bool(f.archived)
    )

def map_category(cat: Category, items_count: int = 0) -> CategoryOut:
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        icon=cat.icon,
        color=cat.color,
        track_expiry=bool(cat.track_expiry),
        expiry_label=cat.expiry_label,
        sort_order=cat.sort_order,
        items_count=items_count,
        created_at=cat.created_at,
        updated_at=cat.updated_at
    )

@router.get("", response_model=List[CategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:read"))
):
    cats = db.query(Category).filter(Category.deleted_at.is_(None)).order_by(Category.sort_order, Category.id).all()
    # compute active item counts per category
    counts_query = (
        db.query(Item.category_id, func.count(Item.id))
        .filter(Item.deleted_at.is_(None))
        .group_by(Item.category_id)
        .all()
    )
    counts_map = dict(counts_query)

    return [map_category(c, counts_map.get(c.id, 0)) for c in cats]

@router.post("", response_model=CategoryOut)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:write"))
):
    existing = db.query(Category).filter(
        Category.name == payload.name.strip(),
        Category.deleted_at.is_(None)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "DUPLICATE_NAME", "message": f"Category '{payload.name}' already exists"}}
        )

    max_sort = db.query(func.max(Category.sort_order)).scalar() or 0
    cat = Category(
        name=payload.name.strip(),
        icon=payload.icon,
        color=payload.color,
        track_expiry=1 if payload.track_expiry else 0,
        expiry_label=payload.expiry_label or "Expiry date",
        sort_order=max_sort + 1
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return map_category(cat, 0)

@router.get("/{id}", response_model=CategoryDetailOut)
def get_category(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:read"))
):
    cat = db.query(Category).filter(Category.id == id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}}
        )
    items_count = db.query(Item).filter(Item.category_id == id, Item.deleted_at.is_(None)).count()
    fields = [map_field(f) for f in cat.fields if not f.archived]
    cat_out = map_category(cat, items_count)
    return CategoryDetailOut(**cat_out.model_dump(), fields=fields)

@router.put("/{id}", response_model=CategoryOut)
def update_category(
    id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:write"))
):
    cat = db.query(Category).filter(Category.id == id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}}
        )

    if payload.name is not None and payload.name.strip() != cat.name:
        dup = db.query(Category).filter(
            Category.name == payload.name.strip(),
            Category.id != id,
            Category.deleted_at.is_(None)
        ).first()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "DUPLICATE_NAME", "message": f"Category '{payload.name}' already exists"}}
            )
        cat.name = payload.name.strip()

    if payload.icon is not None:
        cat.icon = payload.icon
    if payload.color is not None:
        cat.color = payload.color
    if payload.track_expiry is not None:
        cat.track_expiry = 1 if payload.track_expiry else 0
    if payload.expiry_label is not None:
        cat.expiry_label = payload.expiry_label
    if payload.sort_order is not None:
        cat.sort_order = payload.sort_order

    cat.updated_at = utc_now_iso()
    db.commit()
    db.refresh(cat)
    items_count = db.query(Item).filter(Item.category_id == id, Item.deleted_at.is_(None)).count()
    return map_category(cat, items_count)

@router.delete("/{id}", response_model=SuccessResponse)
def delete_category(
    id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:write"))
):
    cat = db.query(Category).filter(Category.id == id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}}
        )

    # Block delete if category still has active items
    active_items = db.query(Item).filter(Item.category_id == id, Item.deleted_at.is_(None)).count()
    if active_items > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "CATEGORY_HAS_ITEMS",
                    "message": f"Cannot delete category '{cat.name}' because it contains {active_items} item(s). Please move or delete the items first."
                }
            }
        )

    cat.deleted_at = utc_now_iso()
    db.commit()
    return SuccessResponse(ok=True, message=f"Category '{cat.name}' deleted")
