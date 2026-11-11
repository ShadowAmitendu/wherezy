from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import LabelTemplate, Profile
from backend.app.schemas import (
    LabelTemplateOut, LabelTemplateCreate, LabelTemplateUpdate, SuccessResponse
)
from backend.app.services.permissions import require
from backend.app.services.activity import record

router = APIRouter(prefix="/label-templates", tags=["Label Templates"])

def _to_out(t: LabelTemplate) -> LabelTemplateOut:
    return LabelTemplateOut(
        id=t.id,
        name=t.name,
        kind=t.kind,
        width_mm=t.width_mm,
        height_mm=t.height_mm,
        page_json=t.page_json,
        layout=t.layout,
        fields_json=t.fields_json,
        style_json=t.style_json,
        is_default=bool(t.is_default),
        owner_id=t.owner_id,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )

@router.get("", response_model=List[LabelTemplateOut])
def list_label_templates(
    kind: Optional[str] = None,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("labels:read"))
):
    q = db.query(LabelTemplate)
    if kind:
        q = q.filter(LabelTemplate.kind == kind)
    # Return shared templates + current user's templates
    q = q.filter((LabelTemplate.owner_id.is_(None)) | (LabelTemplate.owner_id == current.id))
    return [_to_out(t) for t in q.order_by(LabelTemplate.name).all()]

@router.post("", response_model=LabelTemplateOut)
def create_label_template(
    payload: LabelTemplateCreate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("labels:write_own"))
):
    # Only Admin can create shared templates or mark default
    owner_id = None if current.role == "admin" and not payload.is_default else current.id
    is_default = payload.is_default if current.role == "admin" else False

    if is_default:
        # Clear existing default for this kind
        db.query(LabelTemplate).filter(LabelTemplate.kind == payload.kind).update({"is_default": 0})

    tpl = LabelTemplate(
        name=payload.name.strip(),
        kind=payload.kind,
        width_mm=payload.width_mm,
        height_mm=payload.height_mm,
        page_json=payload.page_json,
        layout=payload.layout,
        fields_json=payload.fields_json,
        style_json=payload.style_json,
        is_default=1 if is_default else 0,
        owner_id=owner_id
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)

    record(db, "label", "created", f"Created label template '{tpl.name}'", entity_id=tpl.id, actor=current)
    db.commit()

    return _to_out(tpl)

@router.put("/{template_id}", response_model=LabelTemplateOut)
def update_label_template(
    template_id: int,
    payload: LabelTemplateUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("labels:write_own"))
):
    tpl = db.query(LabelTemplate).filter(LabelTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Template not found"}})

    if tpl.owner_id is not None and tpl.owner_id != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Can only edit own templates"}})

    if payload.name is not None:
        tpl.name = payload.name.strip()
    if payload.width_mm is not None:
        tpl.width_mm = payload.width_mm
    if payload.height_mm is not None:
        tpl.height_mm = payload.height_mm
    if payload.page_json is not None:
        tpl.page_json = payload.page_json
    if payload.layout is not None:
        tpl.layout = payload.layout
    if payload.fields_json is not None:
        tpl.fields_json = payload.fields_json
    if payload.style_json is not None:
        tpl.style_json = payload.style_json

    if payload.is_default is not None and current.role == "admin":
        if payload.is_default:
            db.query(LabelTemplate).filter(LabelTemplate.kind == tpl.kind).update({"is_default": 0})
        tpl.is_default = 1 if payload.is_default else 0

    db.commit()
    db.refresh(tpl)

    record(db, "label", "updated", f"Updated label template '{tpl.name}'", entity_id=tpl.id, actor=current)
    db.commit()

    return _to_out(tpl)

@router.delete("/{template_id}", response_model=SuccessResponse)
def delete_label_template(
    template_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("labels:write_own"))
):
    tpl = db.query(LabelTemplate).filter(LabelTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Template not found"}})

    if tpl.owner_id is not None and tpl.owner_id != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Can only delete own templates"}})

    name = tpl.name
    db.delete(tpl)
    db.commit()

    record(db, "label", "deleted", f"Deleted label template '{name}'", entity_id=template_id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Template '{name}' deleted")

@router.post("/{template_id}/default", response_model=SuccessResponse)
def set_default_label_template(
    template_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("labels:write_all"))
):
    tpl = db.query(LabelTemplate).filter(LabelTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Template not found"}})

    db.query(LabelTemplate).filter(LabelTemplate.kind == tpl.kind).update({"is_default": 0})
    tpl.is_default = 1
    db.commit()

    record(db, "label", "default_set", f"Set default template for '{tpl.kind}' to '{tpl.name}'", entity_id=tpl.id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Template '{tpl.name}' set as default for {tpl.kind}")
