import os
import csv
import io
import json
import uuid
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
from backend.app.services.location_service import get_location_path_str
from backend.app.services.permissions import require
from backend.app.services.activity import record
from backend.app.routers.settings import get_setting_val

router = APIRouter(prefix="/admin", tags=["Admin"])
MAX_CSV_UPLOAD_BYTES = 10 * 1024 * 1024

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
                "location": it.location.name if it.location else None,
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
            sanitize_csv_cell(it.location.name if it.location else ""),
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

def _build_location_lookup(db: Session):
    """Build path-based and unambiguous name-based lookup maps for active locations."""
    path_map: dict[str, int] = {}
    name_map: dict[str, int] = {}
    ambiguous_names: set[str] = set()

    locations = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    for loc in locations:
        full_path = get_location_path_str(db, loc.id)
        if full_path:
            path_map[full_path.strip().lower()] = loc.id
        lname = loc.name.strip().lower()
        if lname in ambiguous_names:
            continue
        if lname in name_map:
            del name_map[lname]
            ambiguous_names.add(lname)
        else:
            name_map[lname] = loc.id

    return path_map, name_map, ambiguous_names


@router.post("/import-csv", response_model=ImportCsvResult)
def import_csv(
    category_id: int = Query(...),
    dry_run: bool = Query(True),
    location_id: Optional[int] = Query(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:import"))
):
    cat = db.query(Category).filter(Category.id == category_id, Category.deleted_at.is_(None)).first()
    if not cat:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Category not found"}})

    default_location_id = location_id if (location_id is not None and location_id != 0) else None
    if default_location_id is not None:
        default_loc = db.query(Location).filter(Location.id == default_location_id, Location.deleted_at.is_(None)).first()
        if not default_loc:
            raise HTTPException(status_code=404, detail={"error": {"code": "LOCATION_NOT_FOUND", "message": "Location not found"}})

    raw_bytes = file.file.read(MAX_CSV_UPLOAD_BYTES + 1)
    if len(raw_bytes) > MAX_CSV_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail={"error": {"code": "FILE_TOO_LARGE", "message": "CSV exceeds 10 MB limit"}})
    try:
        content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ENCODING", "message": "CSV must be UTF-8 encoded"}})
    reader = csv.reader(io.StringIO(content))
    headers = next(reader, None)
    if not headers:
        raise HTTPException(status_code=400, detail={"error": {"code": "EMPTY_CSV", "message": "CSV file is empty"}})

    # Map headers to fields
    active_fields = [f for f in cat.fields if not f.archived]
    cat_fields = {f.label.lower(): f for f in active_fields}
    header_indices = {}

    name_idx = None
    location_idx = None
    quantity_idx = None
    notes_idx = None
    expiry_idx = None
    for idx, h in enumerate(headers):
        hl = h.strip().lower()
        if hl == "name":
            name_idx = idx
        elif hl == "location":
            location_idx = idx
        elif hl in ("quantity", "qty") and hl not in cat_fields:
            quantity_idx = idx
        elif hl == "notes":
            notes_idx = idx
        elif hl in ("expiry date", "expiry", "valid till"):
            expiry_idx = idx
        elif hl in cat_fields:
            header_indices[idx] = cat_fields[hl]

    path_map, name_map, ambiguous_names = _build_location_lookup(db)
    required_fields = [f for f in active_fields if f.required]

    errors = []
    total_rows = 0
    valid_items = []

    for row_num, row in enumerate(reader, start=2):
        if not any(cell.strip() for cell in row):
            continue
        total_rows += 1
        name = row[name_idx].strip() if (name_idx is not None and name_idx < len(row)) else ""
        if not name:
            errors.append(f"Row {row_num}: Name is required")
            continue

        row_quantity = 1
        if quantity_idx is not None and quantity_idx < len(row):
            raw_qty = row[quantity_idx].strip()
            if raw_qty:
                try:
                    parsed_qty = int(raw_qty)
                    if parsed_qty < 1:
                        raise ValueError("must be at least 1")
                    row_quantity = parsed_qty
                except ValueError:
                    errors.append(f"Row {row_num}: 'Quantity' must be a whole number >= 1")
                    continue

        row_loc_id = default_location_id
        if location_idx is not None and location_idx < len(row):
            raw_loc = row[location_idx].strip()
            if raw_loc:
                loc_key = raw_loc.lower()
                if loc_key in path_map:
                    row_loc_id = path_map[loc_key]
                elif loc_key in name_map:
                    row_loc_id = name_map[loc_key]
                elif loc_key in ambiguous_names:
                    errors.append(f"Row {row_num}: Location '{raw_loc}' matches multiple locations; use full path (e.g. 'Room > Shelf')")
                    continue
                else:
                    errors.append(f"Row {row_num}: Location '{raw_loc}' not found")
                    continue

        raw_notes = row[notes_idx].strip() if (notes_idx is not None and notes_idx < len(row)) else ""
        notes = raw_notes or None
        raw_expiry = row[expiry_idx].strip() if (expiry_idx is not None and expiry_idx < len(row)) else ""
        expiry = raw_expiry if (raw_expiry and cat.track_expiry) else None

        values = {}
        row_error = False
        for idx, field in header_indices.items():
            if idx < len(row):
                cell_val = row[idx].strip()
                if cell_val:
                    if field.type == "number":
                        try:
                            values[field.key] = float(cell_val) if "." in cell_val else int(cell_val)
                        except ValueError:
                            errors.append(f"Row {row_num}: '{field.label}' must be a number")
                            row_error = True
                    elif field.type == "checkbox":
                        values[field.key] = cell_val.lower() in ("yes", "true", "1")
                    elif field.type == "multiselect":
                        values[field.key] = [x.strip() for x in cell_val.split(",") if x.strip()]
                    else:
                        values[field.key] = cell_val

        for req_f in required_fields:
            val = values.get(req_f.key)
            if val is None or val == "" or (isinstance(val, list) and len(val) == 0):
                errors.append(f"Row {row_num}: '{req_f.label}' is required")
                row_error = True

        if row_error:
            continue

        valid_items.append({
            "name": name,
            "category_id": category_id,
            "location_id": row_loc_id,
            "quantity": row_quantity,
            "taken_out": 0,
            "taken_out_quantity": 0,
            "notes": notes,
            "expiry_date": expiry,
            "values_json": json.dumps(values),
            "status": "active",
        })

    if not dry_run and not errors and valid_items:
        batch_id = str(uuid.uuid4())
        created_items: List[Item] = []
        for it_data in valid_items:
            item = Item(**it_data)
            db.add(item)
            created_items.append(item)
        db.flush()
        for item in created_items:
            record(
                db, "item", "created",
                f"Imported '{item.name}' from CSV",
                entity_id=item.id, actor=current, batch_id=batch_id
            )
        db.commit()

    imported_count = len(valid_items) if (dry_run or not errors) else 0
    return ImportCsvResult(
        ok=len(errors) == 0,
        dry_run=dry_run,
        total_rows=total_rows,
        imported_count=imported_count,
        errors=errors
    )
