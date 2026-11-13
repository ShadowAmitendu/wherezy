import json
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.config import TEMPLATES_DIR
from backend.app.core.db import get_db
from backend.app.models import Category, FieldDef, Profile, CustomTemplate
from backend.app.schemas import (
    TemplateSummary,
    TemplateFieldDef,
    TemplateDetailOut,
    CustomTemplateCreate,
    CustomTemplateUpdate,
    ApplyCustomizedTemplate,
    CategoryDetailOut,
    SuccessResponse,
)
from backend.app.services.form_validator import generate_field_key
from backend.app.services.permissions import require
from backend.app.routers.categories import map_category, map_field
from backend.app.services.activity import record

router = APIRouter(prefix="/templates", tags=["Templates"])

AVAILABLE_TEMPLATES = [
    {"slug": "medicines", "file": "medicines.json"},
    {"slug": "first_aid", "file": "first_aid.json"},
    {"slug": "festivals", "file": "festivals.json"},
    {"slug": "puja", "file": "puja.json"},
    {"slug": "lights", "file": "lights.json"},
    {"slug": "tools", "file": "tools.json"},
    {"slug": "hardware", "file": "hardware.json"},
    {"slug": "documents", "file": "documents.json"},
    {"slug": "power_backup", "file": "power_backup.json"},
    {"slug": "electronics", "file": "electronics.json"},
    {"slug": "cables", "file": "cables.json"},
    {"slug": "batteries", "file": "batteries.json"},
    {"slug": "pantry", "file": "pantry.json"},
    {"slug": "kitchenware", "file": "kitchenware.json"},
    {"slug": "cleaning", "file": "cleaning.json"},
    {"slug": "clothing", "file": "clothing.json"},
    {"slug": "traditional_wear", "file": "traditional_wear.json"},
    {"slug": "bedding", "file": "bedding.json"},
    {"slug": "jewelry_valuables", "file": "jewelry_valuables.json"},
    {"slug": "monsoon_seasonal", "file": "monsoon_seasonal.json"},
    {"slug": "keys", "file": "keys.json"},
    {"slug": "books", "file": "books.json"},
    {"slug": "automotive", "file": "automotive.json"},
    {"slug": "garden", "file": "garden.json"},
    {"slug": "pets", "file": "pets.json"},
    {"slug": "camping", "file": "camping.json"},
    {"slug": "hobbies", "file": "hobbies.json"},
]


def _generate_template_slug(db: Session, base_name: str, existing_id: Optional[int] = None) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", base_name.lower()).strip("_") or "custom_template"
    slug = cleaned
    idx = 2
    builtin_slugs = {t["slug"] for t in AVAILABLE_TEMPLATES} | {"blank"}
    while slug in builtin_slugs or db.query(CustomTemplate).filter(
        CustomTemplate.slug == slug,
        CustomTemplate.id != existing_id if existing_id else True,
    ).first():
        slug = f"{cleaned}_{idx}"
        idx += 1
    return slug


@router.get("", response_model=List[TemplateSummary])
def list_templates(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:read")),
):
    summaries = []

    # 1. Custom templates created by users
    custom_tpls = db.query(CustomTemplate).order_by(CustomTemplate.name.asc()).all()
    for ct in custom_tpls:
        try:
            fields = json.loads(ct.fields_json or "[]")
        except Exception:
            fields = []
        summaries.append(
            TemplateSummary(
                name=ct.name,
                slug=ct.slug,
                icon=ct.icon,
                color=ct.color,
                track_expiry=bool(ct.track_expiry),
                expiry_label=ct.expiry_label,
                field_count=len(fields),
                is_custom=True,
                description=ct.description,
            )
        )

    # 2. Builtin starter templates
    for t in AVAILABLE_TEMPLATES:
        path = TEMPLATES_DIR / t["file"]
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            summaries.append(
                TemplateSummary(
                    name=data.get("name", t["slug"].capitalize()),
                    slug=t["slug"],
                    icon=data.get("icon", "category"),
                    color=data.get("color", "#1976d2"),
                    track_expiry=bool(data.get("track_expiry", False)),
                    expiry_label=data.get("expiry_label", "Expiry date"),
                    field_count=len(data.get("fields", [])),
                    is_custom=False,
                    description=data.get("description"),
                )
            )

    # 3. Blank template
    summaries.append(
        TemplateSummary(
            name="Blank",
            slug="blank",
            icon="create_new_folder",
            color="#757575",
            track_expiry=False,
            expiry_label="Expiry date",
            field_count=0,
            is_custom=False,
            description="Empty category without any predefined custom fields",
        )
    )
    return summaries


@router.get("/{slug}", response_model=TemplateDetailOut)
def get_template(
    slug: str,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:read")),
):
    if slug == "blank":
        return TemplateDetailOut(
            name="Blank",
            slug="blank",
            icon="create_new_folder",
            color="#757575",
            track_expiry=False,
            expiry_label="Expiry date",
            description="Empty category without any predefined custom fields",
            is_custom=False,
            field_count=0,
            fields=[],
        )

    # 1. Custom template check
    ct = db.query(CustomTemplate).filter(CustomTemplate.slug == slug).first()
    if ct:
        try:
            fields_data = json.loads(ct.fields_json or "[]")
        except Exception:
            fields_data = []
        parsed_fields = [TemplateFieldDef(**f) for f in fields_data]
        return TemplateDetailOut(
            name=ct.name,
            slug=ct.slug,
            icon=ct.icon,
            color=ct.color,
            track_expiry=bool(ct.track_expiry),
            expiry_label=ct.expiry_label,
            description=ct.description,
            is_custom=True,
            field_count=len(parsed_fields),
            fields=parsed_fields,
        )

    # 2. Builtin starter template check
    found = next((t for t in AVAILABLE_TEMPLATES if t["slug"] == slug), None)
    if not found:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Template not found"}},
        )

    path = TEMPLATES_DIR / found["file"]
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    fields_data = data.get("fields", [])
    parsed_fields = [
        TemplateFieldDef(
            label=f.get("label", ""),
            type=f.get("type", "text"),
            required=bool(f.get("required", False)),
            show_in_list=bool(f.get("show_in_list", True)),
            options=f.get("options"),
            unit=f.get("unit"),
            hint=f.get("hint"),
        )
        for f in fields_data
    ]

    return TemplateDetailOut(
        name=data.get("name", slug.capitalize()),
        slug=slug,
        icon=data.get("icon", "category"),
        color=data.get("color", "#1976d2"),
        track_expiry=bool(data.get("track_expiry", False)),
        expiry_label=data.get("expiry_label", "Expiry date"),
        description=data.get("description"),
        is_custom=False,
        field_count=len(parsed_fields),
        fields=parsed_fields,
    )


@router.post("", response_model=TemplateDetailOut)
def create_custom_template(
    payload: CustomTemplateCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("templates:write")),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "Template name is required"}},
        )

    slug = payload.slug.strip().lower() if payload.slug else _generate_template_slug(db, name)
    builtin_slugs = {t["slug"] for t in AVAILABLE_TEMPLATES} | {"blank"}
    if slug in builtin_slugs or db.query(CustomTemplate).filter(CustomTemplate.slug == slug).first():
        slug = _generate_template_slug(db, name)

    fields_data = [f.model_dump() for f in payload.fields]
    ct = CustomTemplate(
        slug=slug,
        name=name,
        description=payload.description.strip() if payload.description else None,
        icon=payload.icon or "category",
        color=payload.color or "#1976d2",
        track_expiry=1 if payload.track_expiry else 0,
        expiry_label=payload.expiry_label or "Expiry date",
        fields_json=json.dumps(fields_data),
        created_by_id=current.id,
    )
    db.add(ct)
    db.commit()
    db.refresh(ct)

    record(db, "template", "created", f"Created custom template '{ct.name}'", entity_id=ct.id, actor=current)
    return TemplateDetailOut(
        name=ct.name,
        slug=ct.slug,
        icon=ct.icon,
        color=ct.color,
        track_expiry=bool(ct.track_expiry),
        expiry_label=ct.expiry_label,
        description=ct.description,
        is_custom=True,
        field_count=len(payload.fields),
        fields=payload.fields,
    )


@router.put("/{slug}", response_model=TemplateDetailOut)
def update_custom_template(
    slug: str,
    payload: CustomTemplateUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("templates:write")),
):
    builtin_slugs = {t["slug"] for t in AVAILABLE_TEMPLATES} | {"blank"}
    if slug in builtin_slugs:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "BUILTIN_IMMUTABLE",
                    "message": "Built-in starter templates cannot be modified directly. Save as a new custom template instead.",
                }
            },
        )

    ct = db.query(CustomTemplate).filter(CustomTemplate.slug == slug).first()
    if not ct:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Custom template not found"}},
        )

    if payload.name is not None and payload.name.strip():
        ct.name = payload.name.strip()
    if payload.icon is not None:
        ct.icon = payload.icon
    if payload.color is not None:
        ct.color = payload.color
    if payload.track_expiry is not None:
        ct.track_expiry = 1 if payload.track_expiry else 0
    if payload.expiry_label is not None:
        ct.expiry_label = payload.expiry_label
    if payload.description is not None:
        ct.description = payload.description.strip() or None
    if payload.fields is not None:
        ct.fields_json = json.dumps([f.model_dump() for f in payload.fields])

    db.commit()
    db.refresh(ct)

    record(db, "template", "updated", f"Updated custom template '{ct.name}'", entity_id=ct.id, actor=current)
    fields = [TemplateFieldDef(**f) for f in json.loads(ct.fields_json or "[]")]
    return TemplateDetailOut(
        name=ct.name,
        slug=ct.slug,
        icon=ct.icon,
        color=ct.color,
        track_expiry=bool(ct.track_expiry),
        expiry_label=ct.expiry_label,
        description=ct.description,
        is_custom=True,
        field_count=len(fields),
        fields=fields,
    )


@router.delete("/{slug}", response_model=SuccessResponse)
def delete_custom_template(
    slug: str,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("templates:write")),
):
    builtin_slugs = {t["slug"] for t in AVAILABLE_TEMPLATES} | {"blank"}
    if slug in builtin_slugs:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "BUILTIN_IMMUTABLE", "message": "Built-in templates cannot be deleted"}},
        )

    ct = db.query(CustomTemplate).filter(CustomTemplate.slug == slug).first()
    if not ct:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Custom template not found"}},
        )

    name = ct.name
    template_id = ct.id
    db.delete(ct)
    db.commit()

    record(db, "template", "deleted", f"Deleted custom template '{name}'", entity_id=template_id, actor=current)
    return SuccessResponse(ok=True, message=f"Custom template '{name}' deleted successfully")


@router.post("/from-category/{category_id}", response_model=TemplateDetailOut)
def save_category_as_template(
    category_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("templates:write")),
):
    cat = db.query(Category).filter(Category.id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}},
        )

    fields = db.query(FieldDef).filter(FieldDef.category_id == cat.id, FieldDef.archived == 0).order_by(FieldDef.sort_order.asc()).all()
    template_fields = []
    for f in fields:
        opts = []
        if f.options_json:
            try:
                opts = json.loads(f.options_json)
            except Exception:
                opts = []
        template_fields.append({
            "label": f.label,
            "type": f.type,
            "required": bool(f.required),
            "show_in_list": bool(f.show_in_list),
            "options": opts if opts else None,
            "unit": f.unit,
            "hint": f.hint,
        })

    slug = _generate_template_slug(db, cat.name)
    ct = CustomTemplate(
        slug=slug,
        name=f"{cat.name} Template",
        description=f"Saved from existing category '{cat.name}'",
        icon=cat.icon,
        color=cat.color,
        track_expiry=cat.track_expiry,
        expiry_label=cat.expiry_label,
        fields_json=json.dumps(template_fields),
        created_by_id=current.id,
    )
    db.add(ct)
    db.commit()
    db.refresh(ct)

    record(db, "template", "created", f"Saved category '{cat.name}' as template '{ct.name}'", entity_id=ct.id, actor=current)
    parsed = [TemplateFieldDef(**tf) for tf in template_fields]
    return TemplateDetailOut(
        name=ct.name,
        slug=ct.slug,
        icon=ct.icon,
        color=ct.color,
        track_expiry=bool(ct.track_expiry),
        expiry_label=ct.expiry_label,
        description=ct.description,
        is_custom=True,
        field_count=len(parsed),
        fields=parsed,
    )


@router.post("/{slug}/apply", response_model=CategoryDetailOut)
def apply_template(
    slug: str,
    payload: Optional[ApplyCustomizedTemplate] = None,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("templates:write")),
):
    # Determine base values
    if slug == "blank":
        base_name = payload.name if (payload and payload.name) else "Custom Category"
        icon = payload.icon if (payload and payload.icon) else "category"
        color = payload.color if (payload and payload.color) else "#1976d2"
        track_expiry = payload.track_expiry if (payload and payload.track_expiry is not None) else False
        expiry_label = payload.expiry_label if (payload and payload.expiry_label) else "Expiry date"
        fields_data = [f.model_dump() for f in payload.fields] if (payload and payload.fields is not None) else []
    else:
        # Check custom templates first
        ct = db.query(CustomTemplate).filter(CustomTemplate.slug == slug).first()
        if ct:
            def_name = ct.name
            def_icon = ct.icon
            def_color = ct.color
            def_expiry = bool(ct.track_expiry)
            def_expiry_lbl = ct.expiry_label
            try:
                def_fields = json.loads(ct.fields_json or "[]")
            except Exception:
                def_fields = []
        else:
            # Check builtins
            found = next((t for t in AVAILABLE_TEMPLATES if t["slug"] == slug), None)
            if not found:
                raise HTTPException(
                    status_code=404,
                    detail={"error": {"code": "NOT_FOUND", "message": "Template not found"}},
                )
            path = TEMPLATES_DIR / found["file"]
            with open(path, "r", encoding="utf-8") as f:
                template_data = json.load(f)
            def_name = template_data.get("name", slug.capitalize())
            def_icon = template_data.get("icon", "category")
            def_color = template_data.get("color", "#1976d2")
            def_expiry = bool(template_data.get("track_expiry", False))
            def_expiry_lbl = template_data.get("expiry_label", "Expiry date")
            def_fields = template_data.get("fields", [])

        # Apply user customization overrides if provided
        base_name = payload.name.strip() if (payload and payload.name and payload.name.strip()) else def_name
        icon = payload.icon if (payload and payload.icon) else def_icon
        color = payload.color if (payload and payload.color) else def_color
        track_expiry = payload.track_expiry if (payload and payload.track_expiry is not None) else def_expiry
        expiry_label = payload.expiry_label if (payload and payload.expiry_label) else def_expiry_lbl
        fields_data = [f.model_dump() for f in payload.fields] if (payload and payload.fields is not None) else def_fields

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
        sort_order=max_sort + 1,
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
            show_in_list=1 if f_data.get("show_in_list", True) else 0,
            archived=0,
        )
        db.add(f)
        field_defs.append(f)

    db.commit()
    db.refresh(cat)

    record(db, "category", "created", f"Created category '{cat.name}' from template '{slug}'", entity_id=cat.id, actor=current)
    cat_out = map_category(cat, 0)
    return CategoryDetailOut(**cat_out.model_dump(), fields=[map_field(f) for f in field_defs])
