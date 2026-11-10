import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Setting
from backend.app.schemas import SettingsResponse, SettingsUpdateRequest, PrintDefaults

router = APIRouter(prefix="/settings", tags=["Settings"])

DEFAULT_SETTINGS = {
    "expiry_warn_days": 30,
    "base_url": None,
    "label_preset": "medium",
    "print_defaults": {
        "include_sub": True,
        "show_photos": True,
        "show_audit_box": True,
        "font_size": "medium"
    },
    "theme": "system",
    "backup_keep": 7,
    "photo_limit_per_owner": 10
}

def get_setting_val(db: Session, key: str, default: any):
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row:
        return default
    try:
        return json.loads(row.value_json)
    except Exception:
        return default

def set_setting_val(db: Session, key: str, value: any):
    row = db.query(Setting).filter(Setting.key == key).first()
    val_json = json.dumps(value)
    if not row:
        row = Setting(key=key, value_json=val_json)
        db.add(row)
    else:
        row.value_json = val_json

@router.get("", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    warn_days = get_setting_val(db, "expiry_warn_days", DEFAULT_SETTINGS["expiry_warn_days"])
    base_url = get_setting_val(db, "base_url", DEFAULT_SETTINGS["base_url"])
    label_preset = get_setting_val(db, "label_preset", DEFAULT_SETTINGS["label_preset"])
    print_defaults_raw = get_setting_val(db, "print_defaults", DEFAULT_SETTINGS["print_defaults"])
    theme = get_setting_val(db, "theme", DEFAULT_SETTINGS["theme"])
    backup_keep = get_setting_val(db, "backup_keep", DEFAULT_SETTINGS["backup_keep"])
    photo_limit = get_setting_val(db, "photo_limit_per_owner", DEFAULT_SETTINGS["photo_limit_per_owner"])

    return SettingsResponse(
        expiry_warn_days=int(warn_days),
        base_url=base_url,
        label_preset=str(label_preset),
        print_defaults=PrintDefaults(**print_defaults_raw) if isinstance(print_defaults_raw, dict) else PrintDefaults(),
        theme=str(theme),
        backup_keep=int(backup_keep),
        photo_limit_per_owner=int(photo_limit)
    )

@router.put("", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdateRequest, db: Session = Depends(get_db)):
    if payload.expiry_warn_days is not None:
        set_setting_val(db, "expiry_warn_days", payload.expiry_warn_days)
    if payload.base_url is not None:
        set_setting_val(db, "base_url", payload.base_url.strip() if payload.base_url else None)
    if payload.label_preset is not None:
        set_setting_val(db, "label_preset", payload.label_preset)
    if payload.print_defaults is not None:
        set_setting_val(db, "print_defaults", payload.print_defaults.model_dump())
    if payload.theme is not None:
        set_setting_val(db, "theme", payload.theme)
    if payload.backup_keep is not None:
        set_setting_val(db, "backup_keep", payload.backup_keep)
    if payload.photo_limit_per_owner is not None:
        set_setting_val(db, "photo_limit_per_owner", payload.photo_limit_per_owner)

    db.commit()
    return get_settings(db)
