import os
import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.core.config import DB_PATH, PHOTOS_DIR, BACKUPS_DIR
from backend.app.models import Item, Category, Location, FieldDef
from backend.app.schemas import (
    BackupFileOut, StorageStatsResponse, SuccessResponse, ImportCsvResult
)
from backend.app.services.backup_service import (
    create_backup_archive, prune_old_backups, restore_backup_archive, get_dir_size
)
from backend.app.routers.settings import get_setting_val

router = APIRouter(prefix="/admin", tags=["Admin"])

def sanitize_csv_cell(val: any) -> str:
    if val is None:
        return ""
    s = str(val)
    if s and s[0] in ("=", "+", "-", "@"):
        return "'" + s
    return s

@router.post("/backup")
def make_backup(db: Session = Depends(get_db)):
    keep_count = int(get_setting_val(db, "backup_keep", 7))
    zip_path = create_backup_archive()
    prune_old_backups(keep_count)
    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=zip_path.name
    )

@router.get("/backups", response_model=List[BackupFileOut])
def list_backups():
    results = []
    for f in sorted(BACKUPS_DIR.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True):
        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat()
        results.append(BackupFileOut(
            file_name=f.name,
            size_bytes=f.stat().st_size,
            created_at=mtime
        ))
    return results

@router.post("/restore", response_model=SuccessResponse)
def restore_backup(file: UploadFile = File(...)):
    message = restore_backup_archive(file)
    return SuccessResponse(ok=True, message=message)

@router.get("/storage", response_model=StorageStatsResponse)
def get_storage_stats():
    db_size = os.path.getsize(str(DB_PATH)) if DB_PATH.exists() else 0
    photos_size = get_dir_size(PHOTOS_DIR)
    backups_size = get_dir_size(BACKUPS_DIR)
    total = db_size + photos_size + backups_size
    return StorageStatsResponse(
        db_bytes=db_size,
        photos_bytes=photos_size,
        backups_bytes=backups_size,
        total_bytes=total
    )

@router.get("/export")
def export_data(
    format: str = Query("json", pattern="^(json|csv)$"),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Item).filter(Item.deleted_at.is_(None))
    if category_id:
        query = query.filter(Item.category_id == category_id)
    items = query.all()

    if format == "json":
        data = []
        for it in items:
            vals = {}
            if it.values_json:
                try:
                    vals = json.loads(it.values_json)
                except Exception:
                    pass
            data.append({
                "id": it.id,
                "name": it.name,
                "category_id": it.category_id,
                "category": it.category.name if it.category else None,
                "location_id": it.location_id,
                "location": it.location.name if it.location else None,
                "taken_out": bool(it.taken_out),
                "taken_by": it.taken_by,
                "taken_at": it.taken_at,
                "expiry_date": it.expiry_date,
                "notes": it.notes,
                "values": vals,
                "created_at": it.created_at,
                "updated_at": it.updated_at
            })
        json_str = json.dumps(data, indent=2)
        return Response(
            content=json_str,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=homeinventory_export.json"}
        )

    # CSV format
    fields_headers = []
    field_key_to_label = {}
    if category_id:
        cat_fields = db.query(FieldDef).filter(FieldDef.category_id == category_id, FieldDef.archived == 0).order_by(FieldDef.sort_order).all()
        for f in cat_fields:
            fields_headers.append(f.key)
            field_key_to_label[f.key] = f.label
    else:
        # Collect all active fields across categories
        all_fields = db.query(FieldDef).filter(FieldDef.archived == 0).all()
        for f in all_fields:
            if f.key not in fields_headers:
                fields_headers.append(f.key)
                field_key_to_label[f.key] = f"{f.category.name} - {f.label}" if f.category else f.label

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    base_headers = ["ID", "Name", "Category", "Location", "Taken Out", "Taken By", "Expiry Date", "Notes"]
    custom_labels = [field_key_to_label[k] for k in fields_headers]
    writer.writerow(base_headers + custom_labels)

    for it in items:
        vals = {}
        if it.values_json:
            try:
                vals = json.loads(it.values_json)
            except Exception:
                pass

        row = [
            it.id,
            sanitize_csv_cell(it.name),
            sanitize_csv_cell(it.category.name if it.category else ""),
            sanitize_csv_cell(it.location.name if it.location else ""),
            "Yes" if it.taken_out else "No",
            sanitize_csv_cell(it.taken_by or ""),
            sanitize_csv_cell(it.expiry_date or ""),
            sanitize_csv_cell(it.notes or "")
        ]
        for f_key in fields_headers:
            f_val = vals.get(f_key, "")
            if isinstance(f_val, list):
                f_val = ", ".join(str(x) for x in f_val)
            row.append(sanitize_csv_cell(f_val))
        writer.writerow(row)

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=homeinventory_export.csv"}
    )

@router.post("/import-csv", response_model=ImportCsvResult)
def import_csv(
    category_id: int = Query(...),
    dry_run: bool = Query(True),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    cat = db.query(Category).filter(Category.id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}})

    content = file.file.read().decode("utf-8-sig")
    reader = csv.reader(io.StringIO(content))
    headers = next(reader, None)
    if not headers:
        raise HTTPException(status_code=400, detail={"error": {"code": "EMPTY_CSV", "message": "CSV file is empty"}})

    # Map headers to fields
    cat_fields = {f.label.lower(): f for f in cat.fields if not f.archived}
    header_indices = {}
    for idx, h in enumerate(headers):
        h_clean = h.strip().lower()
        if h_clean in cat_fields:
            header_indices[idx] = cat_fields[h_clean]

    name_idx = None
    notes_idx = None
    expiry_idx = None
    for idx, h in enumerate(headers):
        hl = h.strip().lower()
        if hl == "name":
            name_idx = idx
        elif hl == "notes":
            notes_idx = idx
        elif hl in ("expiry date", "expiry", "valid till"):
            expiry_idx = idx

    errors = []
    total_rows = 0
    valid_items = []

    for row_num, row in enumerate(reader, start=2):
        if not any(row):
            continue
        total_rows += 1
        name = row[name_idx].strip() if (name_idx is not None and name_idx < len(row)) else ""
        if not name:
            errors.append(f"Row {row_num}: Name is required")
            continue

        notes = row[notes_idx].strip() if (notes_idx is not None and notes_idx < len(row)) else None
        expiry = row[expiry_idx].strip() if (expiry_idx is not None and expiry_idx < len(row)) else None

        values = {}
        for idx, field in header_indices.items():
            if idx < len(row):
                cell_val = row[idx].strip()
                if cell_val:
                    if field.type == "number":
                        try:
                            values[field.key] = float(cell_val) if "." in cell_val else int(cell_val)
                        except ValueError:
                            errors.append(f"Row {row_num}: '{field.label}' must be a number")
                    elif field.type == "checkbox":
                        values[field.key] = cell_val.lower() in ("yes", "true", "1")
                    elif field.type == "multiselect":
                        values[field.key] = [x.strip() for x in cell_val.split(",") if x.strip()]
                    else:
                        values[field.key] = cell_val

        valid_items.append({
            "name": name,
            "category_id": category_id,
            "notes": notes,
            "expiry_date": expiry,
            "values_json": json.dumps(values)
        })

    if not dry_run and not errors:
        for it_data in valid_items:
            item = Item(**it_data)
            db.add(item)
        db.commit()

    return ImportCsvResult(
        ok=len(errors) == 0,
        dry_run=dry_run,
        total_rows=total_rows,
        imported_count=len(valid_items) if (not dry_run and not errors) else len(valid_items),
        errors=errors
    )
