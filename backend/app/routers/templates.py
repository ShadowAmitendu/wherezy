import json
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Category, FieldDef
from backend.app.schemas import TemplateSummary, CategoryDetailOut
from backend.app.services.form_validator import generate_field_key
from backend.app.routers.categories import map_category, map_field

router = APIRouter(prefix="/templates", tags=["Templates"])

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "seed_templates"

AVAILABLE_TEMPLATES = [
    {"slug": "medicines", "file": "medicines.json"},
    {"slug": "lights", "file": "lights.json"},
    {"slug": "tools", "file": "tools.json"},
    {"slug": "documents", "file": "documents.json"},
]

@router.get("", response_model=List[TemplateSummary])
def list_templates():
    summaries = []
    for t in AVAILABLE_TEMPLATES:
        path = TEMPLATES_DIR / t["file"]
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            summaries.append(TemplateSummary(
                name=data.get("name", t["slug"].capitalize()),
                slug=t["slug"],
                icon=data.get("icon", "category"),
                color=data.get("color", "#1976d2"),
                track_expiry=bool(data.get("track_expiry", False)),
                expiry_label=data.get("expiry_label", "Expiry date"),
                field_count=len(data.get("fields", []))
            ))

    summaries.append(TemplateSummary(
        name="Blank",
        slug="blank",
        icon="create_new_folder",
        color="#757575",
        track_expiry=False,
        expiry_label="Expiry date",
        field_count=0
    ))
    return summaries

@router.post("/{slug}/apply", response_model=CategoryDetailOut)
def apply_template(slug: str, db: Session = Depends(get_db)):
    if slug == "blank":
        base_name = "Custom Category"
        icon = "category"
        color = "#1976d2"
        track_expiry = False
        expiry_label = "Expiry date"
        fields_data = []
    else:
        found = next((t for t in AVAILABLE_TEMPLATES if t["slug"] == slug), None)
        if not found:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Template not found"}})
        path = TEMPLATES_DIR / found["file"]
        with open(path, "r", encoding="utf-8") as f:
            template_data = json.load(f)
        base_name = template_data.get("name", slug.capitalize())
        icon = template_data.get("icon", "category")
        color = template_data.get("color", "#1976d2")
        track_expiry = bool(template_data.get("track_expiry", False))
        expiry_label = template_data.get("expiry_label", "Expiry date")
        fields_data = template_data.get("fields", [])

    # Ensure unique category name
    name = base_name
    idx = 2
    while db.query(Category).filter(Category.name == name, Category.deleted_at.is_(None)).first():
        name = f"{base_name} ({idx})"
        idx += 1

    max_sort = db.query(func.max(Category.sort_order)).scalar() or 0
    cat = Category(
        name=name,
        icon=icon,
        color=color,
        track_expiry=1 if track_expiry else 0,
        expiry_label=expiry_label,
        sort_order=max_sort + 1
    )
    db.add(cat)
    db.flush()

    field_defs = []
    for order, f_data in enumerate(fields_data, start=1):
        f = FieldDef(
            category_id=cat.id,
            key=generate_field_key(),
            label=f_data.get("label", ""),
            type=f_data.get("type", "text"),
            required=1 if f_data.get("required") else 0,
            options_json=json.dumps(f_data.get("options")) if f_data.get("options") else None,
            unit=f_data.get("unit"),
            hint=f_data.get("hint"),
            sort_order=order,
            show_in_list=1 if f_data.get("show_in_list") else 0,
            archived=0
        )
        db.add(f)
        field_defs.append(f)

    db.commit()
    db.refresh(cat)

    cat_out = map_category(cat, 0)
    return CategoryDetailOut(**cat_out.model_dump(), fields=[map_field(f) for f in field_defs])
