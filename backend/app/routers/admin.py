import os
import csv
import io
import json
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.core.config import DB_PATH, PHOTOS_DIR, BACKUPS_DIR
from backend.app.models import Item, Category, Location, FieldDef, Profile
from backend.app.schemas import (
    BackupFileOut, StorageStatsResponse, SuccessResponse, ImportCsvResult
)
from backend.app.services.backup_service import (
    create_backup_archive, prune_old_backups, restore_backup_archive, get_dir_size
)
from backend.app.services.import_service import (
    ImportFormat,
    MAX_IMPORT_UPLOAD_BYTES,
    build_import_template,
    import_inventory_file,
)
from backend.app.services.location_service import build_location_path_map
from backend.app.services.permissions import require
from backend.app.services.activity import record
from backend.app.routers.settings import get_setting_val

router = APIRouter(prefix="/admin", tags=["Admin"])
MAX_CSV_UPLOAD_BYTES = MAX_IMPORT_UPLOAD_BYTES

def sanitize_csv_cell(val: any) -> str:
    if val is None:
        return ""
    s = str(val)
    if s and s[0] in ("=", "+", "-", "@"):
        return "'" + s
    return s

@router.post("/backup")
def make_backup(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:backup"))
):
    keep_count = int(get_setting_val(db, "backup_keep", 7))
    zip_path = create_backup_archive()
    prune_old_backups(keep_count)
    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=zip_path.name
    )

@router.get("/backups", response_model=List[BackupFileOut])
def list_backups(current: Profile = Depends(require("admin:backup"))):
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
def restore_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:backup"))
):
    # Release request DB session before replacing SQLite database & WAL files on disk
    db.close()
    message = restore_backup_archive(file)
    return SuccessResponse(ok=True, message=message)

@router.get("/storage", response_model=StorageStatsResponse)
def get_storage_stats(current: Profile = Depends(require("admin:settings"))):
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
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:export"))
):
    query = db.query(Item).filter(Item.deleted_at.is_(None))
    if category_id:
        query = query.filter(Item.category_id == category_id)
    items = query.all()
    location_paths = build_location_path_map(db)

    if format == "json":
        data = []
        for it in items:
            vals = {}
            if it.values_json:
                try:
                    vals = json.loads(it.values_json)
                except (json.JSONDecodeError, TypeError):
                    pass
            qty = max(1, int(it.quantity or 1))
            out_qty = int(it.taken_out_quantity) if it.taken_out_quantity is not None else (1 if it.taken_out else 0)
            out_qty = max(0, min(qty, out_qty))
            data.append({
                "id": it.id,
                "name": it.name,
                "category_id": it.category_id,
                "category": it.category.name if it.category else None,
                "location_id": it.location_id,
                "location": location_paths.get(it.location_id, it.location.name) if it.location else None,
                "quantity": qty,
                "taken_out": out_qty > 0,
                "taken_out_quantity": out_qty,
                "available_quantity": max(0, qty - out_qty),
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
            headers={"Content-Disposition": "attachment; filename=wherezy_export.json"}
        )

    # CSV format — key columns by (category_id, field.key) so identically named keys across categories stay distinct
    field_columns: list[tuple[Optional[int], str, str]] = []
    seen_cols: set[tuple[Optional[int], str]] = set()
    if category_id:
        cat_fields = db.query(FieldDef).filter(FieldDef.category_id == category_id, FieldDef.archived == 0).order_by(FieldDef.sort_order).all()
        for f in cat_fields:
            col_id = (category_id, f.key)
            if col_id not in seen_cols:
                seen_cols.add(col_id)
                field_columns.append((category_id, f.key, f.label))
    else:
        all_fields = db.query(FieldDef).filter(FieldDef.archived == 0).order_by(FieldDef.category_id, FieldDef.sort_order).all()
        for f in all_fields:
            if f.category and f.category.deleted_at is not None:
                continue
            col_id = (f.category_id, f.key)
            if col_id not in seen_cols:
                seen_cols.add(col_id)
                label = f"{f.category.name} - {f.label}" if f.category else f.label
                field_columns.append((f.category_id, f.key, label))

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    base_headers = ["ID", "Name", "Category", "Location", "Quantity", "Taken Out", "Taken Out Qty", "Taken By", "Expiry Date", "Notes"]
    custom_labels = [sanitize_csv_cell(label) for _, _, label in field_columns]
    writer.writerow(base_headers + custom_labels)

    for it in items:
        vals = {}
        if it.values_json:
            try:
                vals = json.loads(it.values_json)
            except (json.JSONDecodeError, TypeError):
                pass

        qty = max(1, int(it.quantity or 1))
        out_qty = int(it.taken_out_quantity) if it.taken_out_quantity is not None else (1 if it.taken_out else 0)
        out_qty = max(0, min(qty, out_qty))
        row = [
            it.id,
            sanitize_csv_cell(it.name),
            sanitize_csv_cell(it.category.name if it.category else ""),
            sanitize_csv_cell(location_paths.get(it.location_id, it.location.name) if it.location else ""),
            qty,
            "Yes" if out_qty > 0 else "No",
            out_qty,
            sanitize_csv_cell(it.taken_by or ""),
            sanitize_csv_cell(it.expiry_date or ""),
            sanitize_csv_cell(it.notes or "")
        ]
        for col_cat_id, f_key, _ in field_columns:
            if col_cat_id is not None and it.category_id != col_cat_id:
                row.append("")
                continue
            f_val = vals.get(f_key, "")
            if isinstance(f_val, list):
                f_val = ", ".join(str(x) for x in f_val)
            row.append(sanitize_csv_cell(f_val))
        writer.writerow(row)

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=wherezy_export.csv"}
    )

@router.get("/import/template")
def download_import_template(
    format: ImportFormat = Query("csv"),
    category_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:import")),
):
    content, media_type, filename = build_import_template(db=db, fmt=format, category_id=category_id)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ImportCsvResult)
def import_items(
    format: Optional[ImportFormat] = Query(None),
    category_id: Optional[int] = Query(None),
    dry_run: bool = Query(True),
    location_id: Optional[int] = Query(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:import")),
):
    return import_inventory_file(
        db=db,
        file=file,
        actor=current,
        fmt=format,
        category_id=category_id,
        dry_run=dry_run,
        location_id=location_id,
    )


@router.post("/import-csv", response_model=ImportCsvResult)
def import_csv(
    category_id: int = Query(...),
    dry_run: bool = Query(True),
    location_id: Optional[int] = Query(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:import")),
):
    return import_inventory_file(
        db=db,
        file=file,
        actor=current,
        fmt="csv",
        category_id=category_id,
        dry_run=dry_run,
        location_id=location_id,
    )
