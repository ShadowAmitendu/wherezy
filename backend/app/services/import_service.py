import csv
import io
import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional, Tuple

import openpyxl
from openpyxl.styles import Font, PatternFill
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.app.models import Category, FieldDef, Item, Location, Profile
from backend.app.schemas import ImportCsvResult
from backend.app.services.activity import record
from backend.app.services.location_service import build_location_path_map, validate_location_capacity

ImportFormat = Literal["csv", "json", "xlsx"]

MAX_IMPORT_UPLOAD_BYTES = 10 * 1024 * 1024
SKIP_XLSX_SHEETS = {"locations", "loans", "retired", "tags"}
RESERVED_JSON_KEYS = {
    "id",
    "name",
    "category",
    "category_id",
    "category_name",
    "location",
    "location_id",
    "location_path",
    "quantity",
    "notes",
    "expiry_date",
    "expiry",
    "values",
    "taken_out",
    "taken_out_quantity",
    "taken_by",
    "taken_by_profile_id",
    "taken_by_contact_id",
    "taken_due",
    "created_at",
    "updated_at",
    "available_quantity",
    "status",
    "tags",
}


@dataclass
class CategoryMeta:
    category: Category
    active_fields: List[FieldDef]
    required_fields: List[FieldDef]
    field_by_label: Dict[str, FieldDef]
    field_by_key: Dict[str, FieldDef]


@dataclass
class ParsedImportRow:
    row_label: str
    name: Any = None
    category_id: Any = None
    category_name: Any = None
    location_id: Any = None
    location: Any = None
    quantity: Any = None
    notes: Any = None
    expiry_date: Any = None
    unscoped_fields: Dict[str, Any] = field(default_factory=dict)
    scoped_fields: Dict[Tuple[int, str], Any] = field(default_factory=dict)
    raw_headers_lower: Dict[str, Any] = field(default_factory=dict)
    is_tabular: bool = False


def unescape_formula_text(val: Any) -> str:
    """Convert cell/scalar values to trimmed strings and unescape CSV/Excel formula prefixes."""
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, date):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    s = str(val).strip()
    if len(s) >= 2 and s[0] == "'" and s[1] in ("=", "+", "-", "@"):
        return s[1:].strip()
    return s


def build_location_lookup(db: Session) -> Tuple[Dict[str, int], Dict[str, int], set[str]]:
    """Build path-based and unambiguous name-based lookup maps for active locations."""
    path_map: Dict[str, int] = {}
    name_map: Dict[str, int] = {}
    ambiguous_names: set[str] = set()

    full_paths = build_location_path_map(db)
    locations = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    for loc in locations:
        full_path = full_paths.get(loc.id)
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


def _build_category_lookup(db: Session) -> Tuple[Dict[int, CategoryMeta], Dict[str, CategoryMeta]]:
    by_id: Dict[int, CategoryMeta] = {}
    by_name: Dict[str, CategoryMeta] = {}
    categories = db.query(Category).filter(Category.deleted_at.is_(None)).all()
    for cat in categories:
        active = sorted(
            [f for f in cat.fields if not f.archived],
            key=lambda f: (f.sort_order or 0, f.id),
        )
        meta = CategoryMeta(
            category=cat,
            active_fields=active,
            required_fields=[f for f in active if f.required],
            field_by_label={f.label.strip().lower(): f for f in active},
            field_by_key={f.key.strip().lower(): f for f in active},
        )
        by_id[cat.id] = meta
        by_name[cat.name.strip().lower()] = meta
    return by_id, by_name


def _api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})


def detect_import_format(
    filename: Optional[str],
    content_type: Optional[str],
    explicit_format: Optional[str] = None,
) -> ImportFormat:
    """Resolve upload format from explicit query param, filename extension, or MIME type."""
    if explicit_format is not None:
        normalized = explicit_format.strip().lower()
        if normalized in ("csv", "json", "xlsx"):
            return normalized  # type: ignore[return-value]
        raise _api_error(400, "UNSUPPORTED_FORMAT", "Unsupported import format. Choose csv, json, or xlsx.")

    lower_name = (filename or "").strip().lower()
    if lower_name.endswith(".csv"):
        return "csv"
    if lower_name.endswith(".json"):
        return "json"
    if lower_name.endswith(".xlsx"):
        return "xlsx"

    lower_type = (content_type or "").strip().lower()
    if "json" in lower_type:
        return "json"
    if "spreadsheetml" in lower_type or "excel" in lower_type or lower_type.endswith("xlsx"):
        return "xlsx"
    if "csv" in lower_type:
        return "csv"

    raise _api_error(400, "UNSUPPORTED_FORMAT", "Could not detect import format. Upload a .csv, .json, or .xlsx file.")


def _extract_tabular_records(
    headers: List[Any],
    data_rows: List[Tuple[int, List[Any]]],
    cat_by_name: Dict[str, CategoryMeta],
    default_category_name: Optional[str] = None,
    sheet_prefix: Optional[str] = None,
) -> List[ParsedImportRow]:
    """Convert raw header/cell rows from CSV or Excel into uniform ParsedImportRow records."""
    parsed_rows: List[ParsedImportRow] = []
    clean_headers = [unescape_formula_text(h) for h in headers]

    for row_num, raw_cells in data_rows:
        if not any(unescape_formula_text(cell) for cell in raw_cells):
            continue

        row_label = f"Sheet '{sheet_prefix}' Row {row_num}" if sheet_prefix else f"Row {row_num}"
        record_row = ParsedImportRow(
            row_label=row_label,
            category_name=default_category_name,
            is_tabular=True,
        )

        for idx, header_text in enumerate(clean_headers):
            if idx >= len(raw_cells):
                continue
            hl = header_text.strip().lower()
            if not hl:
                continue
            cell_val = raw_cells[idx]

            if hl == "name":
                record_row.name = cell_val
            elif hl == "category":
                cat_text = unescape_formula_text(cell_val)
                if cat_text:
                    record_row.category_name = cat_text
            elif hl == "location":
                record_row.location = cell_val
            elif hl == "notes":
                record_row.notes = cell_val
            elif hl in ("expiry date", "expiry", "valid till"):
                record_row.expiry_date = cell_val
            else:
                # Preserve exact key (including quantity/qty ambiguity resolution per target category)
                record_row.raw_headers_lower[hl] = cell_val
                if " - " in header_text:
                    prefix, suffix = header_text.split(" - ", 1)
                    scoped_meta = cat_by_name.get(prefix.strip().lower())
                    if scoped_meta is not None:
                        record_row.scoped_fields[(scoped_meta.category.id, suffix.strip().lower())] = cell_val
                        continue
                record_row.unscoped_fields[hl] = cell_val

        parsed_rows.append(record_row)

    return parsed_rows


def _parse_csv_rows(raw_bytes: bytes, cat_by_name: Dict[str, CategoryMeta]) -> List[ParsedImportRow]:
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise _api_error(400, "INVALID_ENCODING", "CSV must be UTF-8 encoded")

    reader = csv.reader(io.StringIO(text))
    headers = next(reader, None)
    if not headers:
        raise _api_error(400, "EMPTY_CSV", "CSV file is empty")

    data_rows = [(idx, row) for idx, row in enumerate(reader, start=2)]
    return _extract_tabular_records(headers, data_rows, cat_by_name)


def _parse_json_rows(raw_bytes: bytes) -> List[ParsedImportRow]:
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise _api_error(400, "INVALID_ENCODING", "JSON file must be UTF-8 encoded")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise _api_error(400, "INVALID_JSON", f"Invalid JSON syntax: {exc.msg}")

    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        items_list = payload["items"]
    elif isinstance(payload, list):
        items_list = payload
    else:
        raise _api_error(
            400,
            "INVALID_JSON_STRUCTURE",
            'Invalid JSON import format: expected an array of items or {"items": [...]}',
        )

    if len(items_list) == 0:
        raise _api_error(400, "EMPTY_JSON", "JSON file contains no items")

    parsed_rows: List[ParsedImportRow] = []
    for idx, entry in enumerate(items_list, start=1):
        row_label = f"Item {idx}"
        if not isinstance(entry, dict):
            # Capture non-dict entry with empty name; validator handles row error cleanly.
            parsed_rows.append(ParsedImportRow(row_label=row_label, name=None))
            continue

        row = ParsedImportRow(
            row_label=row_label,
            name=entry.get("name"),
            category_id=entry.get("category_id"),
            category_name=entry.get("category") if entry.get("category") is not None else entry.get("category_name"),
            location_id=entry.get("location_id"),
            location=entry.get("location") if entry.get("location") is not None else entry.get("location_path"),
            quantity=entry.get("quantity"),
            notes=entry.get("notes"),
            expiry_date=entry.get("expiry_date") if entry.get("expiry_date") is not None else entry.get("expiry"),
        )
        # Accept nested "values" dict (matching /api/admin/export?format=json) plus flat custom keys
        raw_values = entry.get("values")
        if isinstance(raw_values, dict):
            for k, v in raw_values.items():
                if k is not None:
                    row.unscoped_fields[str(k).strip().lower()] = v
        for k, v in entry.items():
            kl = str(k).strip().lower()
            if kl not in RESERVED_JSON_KEYS and kl not in row.unscoped_fields:
                row.unscoped_fields[kl] = v

        parsed_rows.append(row)

    return parsed_rows


def _match_sheet_category(title: str, cat_by_name: Dict[str, CategoryMeta]) -> Optional[CategoryMeta]:
    norm = title.strip().lower()
    if norm in cat_by_name:
        return cat_by_name[norm]
    # Excel worksheet titles truncate to 31 characters in exports.py
    for cname, meta in cat_by_name.items():
        if cname[:31].strip() == norm:
            return meta
    return None


def _parse_xlsx_rows(raw_bytes: bytes, cat_by_name: Dict[str, CategoryMeta]) -> List[ParsedImportRow]:
    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
    except Exception:
        raise _api_error(400, "INVALID_XLSX", "Invalid or corrupted Excel (.xlsx) file")

    try:
        sheet_names = list(wb.sheetnames)
        if not sheet_names:
            raise _api_error(400, "EMPTY_XLSX", "Excel workbook is empty")

        matched_cat_sheets = {
            name for name in sheet_names if _match_sheet_category(name, cat_by_name) is not None
        }
        has_cat_sheets = len(matched_cat_sheets) > 0

        parsed_rows: List[ParsedImportRow] = []
        multi_sheet = len([n for n in sheet_names if n.strip().lower() not in SKIP_XLSX_SHEETS]) > 1

        for sheet_name in sheet_names:
            lower_sheet = sheet_name.strip().lower()
            if lower_sheet in SKIP_XLSX_SHEETS:
                continue
            if lower_sheet == "all items" and has_cat_sheets:
                # Skip summary sheet when per-category sheets with custom fields exist in workbook export
                continue

            ws = wb[sheet_name]
            rows_iter = ws.iter_rows(values_only=True)
            headers_tuple = next(rows_iter, None)
            if not headers_tuple:
                continue
            headers = list(headers_tuple)
            data_rows = [(row_idx, list(r)) for row_idx, r in enumerate(rows_iter, start=2)]

            matched_meta = _match_sheet_category(sheet_name, cat_by_name)
            sheet_cat_name = matched_meta.category.name if matched_meta else None
            prefix = sheet_name if multi_sheet else None

            parsed_rows.extend(
                _extract_tabular_records(
                    headers=headers,
                    data_rows=data_rows,
                    cat_by_name=cat_by_name,
                    default_category_name=sheet_cat_name,
                    sheet_prefix=prefix,
                )
            )

        if not parsed_rows and not any(
            len(list(wb[name].iter_rows(values_only=True, max_row=1))) > 0
            for name in sheet_names
            if name.strip().lower() not in SKIP_XLSX_SHEETS
        ):
            raise _api_error(400, "EMPTY_XLSX", "Excel workbook is empty")

        return parsed_rows
    finally:
        wb.close()


def _coerce_quantity(raw_qty: Any) -> Tuple[Optional[int], Optional[str]]:
    if raw_qty is None:
        return 1, None
    if isinstance(raw_qty, bool):
        return None, "'Quantity' must be a whole number >= 1"
    if isinstance(raw_qty, int):
        if raw_qty < 1:
            return None, "'Quantity' must be a whole number >= 1"
        return raw_qty, None
    if isinstance(raw_qty, float):
        if not raw_qty.is_integer() or int(raw_qty) < 1:
            return None, "'Quantity' must be a whole number >= 1"
        return int(raw_qty), None

    s = unescape_formula_text(raw_qty)
    if not s:
        return 1, None
    try:
        parsed = int(s)
        if parsed < 1:
            raise ValueError
        return parsed, None
    except ValueError:
        return None, "'Quantity' must be a whole number >= 1"


def _coerce_field_value(field_def: FieldDef, raw_val: Any) -> Tuple[Any, Optional[str]]:
    if raw_val is None:
        return None, None
    if isinstance(raw_val, str) and not raw_val.strip():
        return None, None

    if field_def.type == "number":
        if isinstance(raw_val, bool):
            return None, f"'{field_def.label}' must be a number"
        if isinstance(raw_val, int):
            return raw_val, None
        if isinstance(raw_val, float):
            return (int(raw_val) if raw_val.is_integer() else raw_val), None
        s = unescape_formula_text(raw_val)
        if not s:
            return None, None
        try:
            return (float(s) if "." in s else int(s)), None
        except ValueError:
            return None, f"'{field_def.label}' must be a number"

    if field_def.type == "checkbox":
        if isinstance(raw_val, bool):
            return raw_val, None
        s = unescape_formula_text(raw_val)
        if not s:
            return None, None
        return s.lower() in ("yes", "true", "1"), None

    if field_def.type == "multiselect":
        if isinstance(raw_val, list):
            items = [str(x).strip() for x in raw_val if str(x).strip()]
            return items if items else [], None
        s = unescape_formula_text(raw_val)
        if not s:
            return None, None
        return [x.strip() for x in s.split(",") if x.strip()], None

    s = unescape_formula_text(raw_val)
    return (s if s else None), None


def _resolve_row_category(
    row: ParsedImportRow,
    cat_by_id: Dict[int, CategoryMeta],
    cat_by_name: Dict[str, CategoryMeta],
    default_cat: Optional[CategoryMeta],
) -> Tuple[Optional[CategoryMeta], Optional[str]]:
    raw_cat_name = unescape_formula_text(row.category_name)
    if raw_cat_name:
        found = cat_by_name.get(raw_cat_name.lower())
        if not found:
            return None, f"Category '{raw_cat_name}' not found"
        return found, None

    if row.category_id is not None and str(row.category_id).strip() != "":
        try:
            cid = int(row.category_id)
            found = cat_by_id.get(cid)
            if found:
                return found, None
        except (TypeError, ValueError):
            pass
        return None, f"Category ID '{row.category_id}' not found"

    if default_cat is not None:
        return default_cat, None

    return None, "Category is required (include Category in file or choose a default category)"


def _resolve_row_location(
    row: ParsedImportRow,
    path_map: Dict[str, int],
    name_map: Dict[str, int],
    ambiguous_names: set[str],
    active_loc_ids: set[int],
    default_location_id: Optional[int],
) -> Tuple[Optional[int], Optional[str]]:
    raw_loc = unescape_formula_text(row.location)
    if raw_loc:
        loc_key = raw_loc.lower()
        if loc_key in path_map:
            return path_map[loc_key], None
        if loc_key in name_map:
            return name_map[loc_key], None
        if loc_key in ambiguous_names:
            return None, f"Location '{raw_loc}' matches multiple locations; use full path (e.g. 'Room > Shelf')"
        return None, f"Location '{raw_loc}' not found"

    if row.location_id is not None and str(row.location_id).strip() != "":
        try:
            lid = int(row.location_id)
            if lid in active_loc_ids:
                return lid, None
        except (TypeError, ValueError):
            pass
        return None, f"Location ID '{row.location_id}' not found"

    return default_location_id, None


def import_inventory_file(
    db: Session,
    file: UploadFile,
    actor: Profile,
    fmt: Optional[str] = None,
    category_id: Optional[int] = None,
    dry_run: bool = True,
    location_id: Optional[int] = None,
) -> ImportCsvResult:
    """Validate and optionally commit bulk items imported from CSV, JSON, or Excel (.xlsx)."""
    detected_fmt = detect_import_format(file.filename, file.content_type, fmt)
    cat_by_id, cat_by_name = _build_category_lookup(db)

    default_cat: Optional[CategoryMeta] = None
    if category_id is not None:
        default_cat = cat_by_id.get(category_id)
        if not default_cat:
            raise _api_error(404, "NOT_FOUND", "Category not found")

    default_location_id = location_id if (location_id is not None and location_id != 0) else None
    if default_location_id is not None:
        default_loc = (
            db.query(Location)
            .filter(Location.id == default_location_id, Location.deleted_at.is_(None))
            .first()
        )
        if not default_loc:
            raise _api_error(404, "LOCATION_NOT_FOUND", "Location not found")

    raw_bytes = file.file.read(MAX_IMPORT_UPLOAD_BYTES + 1)
    if len(raw_bytes) > MAX_IMPORT_UPLOAD_BYTES:
        raise _api_error(413, "FILE_TOO_LARGE", "Import file exceeds 10 MB limit")

    if detected_fmt == "csv":
        parsed_rows = _parse_csv_rows(raw_bytes, cat_by_name)
    elif detected_fmt == "json":
        parsed_rows = _parse_json_rows(raw_bytes)
    else:
        parsed_rows = _parse_xlsx_rows(raw_bytes, cat_by_name)

    path_map, name_map, ambiguous_names = build_location_lookup(db)
    active_loc_ids = set(path_map.values())

    errors: List[str] = []
    valid_items: List[Dict[str, Any]] = []
    total_rows = len(parsed_rows)

    for row in parsed_rows:
        name = unescape_formula_text(row.name)
        if not name:
            errors.append(f"{row.row_label}: Name is required")
            continue

        cat_meta, cat_err = _resolve_row_category(row, cat_by_id, cat_by_name, default_cat)
        if cat_err or cat_meta is None:
            errors.append(f"{row.row_label}: {cat_err}")
            continue

        # Handle 'quantity'/'qty' tabular columns (custom field if label matches category field, else item quantity)
        raw_qty = row.quantity
        if raw_qty is None:
            for qty_key in ("quantity", "qty"):
                if qty_key in row.raw_headers_lower and qty_key not in cat_meta.field_by_label:
                    raw_qty = row.raw_headers_lower[qty_key]
                    break
        row_quantity, qty_err = _coerce_quantity(raw_qty)
        if qty_err or row_quantity is None:
            errors.append(f"{row.row_label}: {qty_err}")
            continue

        row_loc_id, loc_err = _resolve_row_location(
            row, path_map, name_map, ambiguous_names, active_loc_ids, default_location_id
        )
        if loc_err:
            errors.append(f"{row.row_label}: {loc_err}")
            continue

        notes = unescape_formula_text(row.notes) or None
        raw_expiry = unescape_formula_text(row.expiry_date)
        expiry = raw_expiry if (raw_expiry and cat_meta.category.track_expiry) else None

        values: Dict[str, Any] = {}
        row_error = False

        # Match custom fields by scoped "<Category> - <Label>" first, then unscoped label or key
        for field_def in cat_meta.active_fields:
            label_lower = field_def.label.strip().lower()
            key_lower = field_def.key.strip().lower()

            raw_field_val: Any = None
            has_val = False
            scoped_key = (cat_meta.category.id, label_lower)
            if scoped_key in row.scoped_fields:
                raw_field_val = row.scoped_fields[scoped_key]
                has_val = True
            elif label_lower in row.unscoped_fields:
                raw_field_val = row.unscoped_fields[label_lower]
                has_val = True
            elif (
                key_lower in row.unscoped_fields
                and not (row.is_tabular and key_lower in ("quantity", "qty"))
            ):
                raw_field_val = row.unscoped_fields[key_lower]
                has_val = True

            if has_val:
                coerced, f_err = _coerce_field_value(field_def, raw_field_val)
                if f_err:
                    errors.append(f"{row.row_label}: {f_err}")
                    row_error = True
                elif coerced is not None:
                    values[field_def.key] = coerced

        for req_f in cat_meta.required_fields:
            val = values.get(req_f.key)
            if val is None or val == "" or (isinstance(val, list) and len(val) == 0):
                errors.append(f"{row.row_label}: '{req_f.label}' is required")
                row_error = True

        if row_error:
            continue

        valid_items.append(
            {
                "name": name,
                "category_id": cat_meta.category.id,
                "location_id": row_loc_id,
                "quantity": row_quantity,
                "taken_out": 0,
                "taken_out_quantity": 0,
                "notes": notes,
                "expiry_date": expiry,
                "values_json": json.dumps(values),
                "status": "active",
            }
        )

    # Check location capacity for valid_items
    incoming_loc_qty: Dict[int, int] = {}
    for it_data in valid_items:
        lid = it_data.get("location_id")
        if lid:
            incoming_loc_qty[lid] = incoming_loc_qty.get(lid, 0) + max(1, int(it_data.get("quantity") or 1))

    for lid, add_q in incoming_loc_qty.items():
        try:
            validate_location_capacity(db, lid, additional_quantity=add_q)
        except HTTPException as exc:
            err_detail = exc.detail.get("error", {}) if isinstance(exc.detail, dict) else {}
            errors.append(err_detail.get("message", f"Location capacity exceeded for location #{lid}"))

    batch_id: Optional[str] = None
    if not dry_run and not errors and valid_items:
        batch_id = str(uuid.uuid4())
        created_items: List[Item] = []
        for it_data in valid_items:
            item = Item(**it_data)
            db.add(item)
            created_items.append(item)
        db.flush()
        fmt_label = detected_fmt.upper()
        for item in created_items:
            record(
                db,
                "item",
                "created",
                f"Imported '{item.name}' from {fmt_label}",
                entity_id=item.id,
                actor=actor,
                batch_id=batch_id,
            )
        db.commit()

    imported_count = len(valid_items) if (dry_run or not errors) else 0
    return ImportCsvResult(
        ok=len(errors) == 0,
        dry_run=dry_run,
        total_rows=total_rows,
        imported_count=imported_count,
        errors=errors,
        batch_id=batch_id,
    )


def build_import_template(
    db: Session,
    fmt: ImportFormat,
    category_id: Optional[int] = None,
) -> Tuple[bytes, str, str]:
    """Generate a starter import template in CSV, JSON, or Excel (.xlsx) format."""
    cat_by_id, _ = _build_category_lookup(db)
    cat_meta: Optional[CategoryMeta] = None
    if category_id is not None:
        cat_meta = cat_by_id.get(category_id)
        if not cat_meta:
            raise _api_error(404, "NOT_FOUND", "Category not found")

    custom_fields = cat_meta.active_fields if cat_meta else []
    include_expiry = bool(cat_meta.category.track_expiry) if cat_meta else False

    headers = ["Name"]
    if cat_meta is None:
        headers.append("Category")
    headers.extend(["Location", "Quantity", "Notes"])
    if include_expiry:
        headers.append("Expiry Date")
    headers.extend(f.label for f in custom_fields)

    safe_slug = (
        "".join(ch for ch in cat_meta.category.name.lower() if ch.isalnum() or ch in ("-", "_"))
        if cat_meta
        else "items"
    ) or "items"

    if fmt == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(headers)
        return out.getvalue().encode("utf-8"), "text/csv", f"template_{safe_slug}.csv"

    if fmt == "json":
        sample_values = {f.key: "" for f in custom_fields}
        sample_entry: Dict[str, Any] = {
            "name": "Example Item",
            **({"category": "General"} if cat_meta is None else {"category": cat_meta.category.name}),
            "location": "",
            "quantity": 1,
            "notes": "",
            **({"expiry_date": ""} if include_expiry else {}),
            "values": sample_values,
        }
        body = json.dumps([sample_entry], indent=2).encode("utf-8")
        return body, "application/json", f"template_{safe_slug}.json"

    # Excel (.xlsx)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = (cat_meta.category.name[:31] if cat_meta else "Items")
    ws.append(headers)
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1976D2", end_color="1976D2", fill_type="solid")
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = max(16, len(headers[col_idx - 1]) + 4)
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    wb.close()
    return (
        buf.getvalue(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        f"template_{safe_slug}.xlsx",
    )
