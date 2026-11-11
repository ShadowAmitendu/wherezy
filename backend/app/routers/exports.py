import io
import json
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.models import Item, Category, Location, Tag, ItemTag, Contact, Profile
from backend.app.services.permissions import require
from backend.app.services.visibility import items_visible
from backend.app.services.activity import record
import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

router = APIRouter(prefix="/admin/export", tags=["Inventory Book Export"])

def escape_formula(val: Any) -> Any:
    if isinstance(val, str) and len(val) > 0 and val[0] in ("=", "+", "-", "@"):
        return "'" + val
    return val

@router.get("/book.xlsx")
def export_inventory_book_excel(
    include_retired: bool = Query(False),
    include_photos: bool = Query(False),
    include_phones: bool = Query(False),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:book"))
):
    """
    Generate and stream complete multi-sheet Inventory Book Excel workbook.
    Formula leading chars escaped.
    """
    wb = openpyxl.Workbook()
    default_sheet = wb.active

    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1976D2", end_color="1976D2", fill_type="solid")

    # Fetch data and lookup maps to avoid N+1 queries inside loops
    items = items_visible(db).all()
    categories = db.query(Category).filter(Category.deleted_at.is_(None)).all()
    locations = db.query(Location).filter(Location.deleted_at.is_(None)).all()
    tags = db.query(Tag).all()
    profiles_by_id = {p.id: p for p in db.query(Profile).all()}
    contacts_by_id = {c.id: c for c in db.query(Contact).all()}
    tag_counts = dict(
        db.query(ItemTag.tag_id, func.count(ItemTag.item_id)).group_by(ItemTag.tag_id).all()
    )

    # 1. Sheet: All Items
    ws_all = wb.create_sheet(title="All Items")
    all_headers = [
        "ID", "Name", "Category", "Location", "Quantity", "Tags", "Expiry Date",
        "Taken Out", "Taken Out Qty", "Borrower", "Due Date", "Created At", "Updated At"
    ]
    ws_all.append(all_headers)
    for col_idx in range(1, len(all_headers) + 1):
        cell = ws_all.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill

    for it in items:
        tag_names = ", ".join(t.name for t in it.tags)
        borrower = it.taken_by
        if it.taken_by_profile_id:
            p = profiles_by_id.get(it.taken_by_profile_id)
            if p:
                borrower = p.name
        elif it.taken_by_contact_id:
            c = contacts_by_id.get(it.taken_by_contact_id)
            if c:
                borrower = c.name + (f" ({c.phone})" if include_phones and c.phone else "")

        qty = max(1, int(it.quantity or 1))
        out_qty = int(it.taken_out_quantity) if it.taken_out_quantity is not None else (1 if it.taken_out else 0)
        ws_all.append([
            it.id,
            escape_formula(it.name),
            escape_formula(it.category.name if it.category else ""),
            escape_formula(it.location.name if it.location else ""),
            qty,
            escape_formula(tag_names),
            it.expiry_date or "",
            "Yes" if out_qty > 0 else "No",
            out_qty,
            escape_formula(borrower or ""),
            it.taken_due or "",
            it.created_at[:10] if it.created_at else "",
            it.updated_at[:10] if it.updated_at else "",
        ])

    ws_all.freeze_panes = "A2"
    ws_all.auto_filter.ref = ws_all.dimensions

    # 2. Per-category sheets
    for cat in categories:
        sheet_title = cat.name[:31].replace(":", "_").replace("/", "_").replace("\\", "_")
        ws_cat = wb.create_sheet(title=sheet_title)

        field_defs = cat.fields
        cat_headers = ["ID", "Name", "Location", "Quantity", "Expiry Date"] + [f.label for f in field_defs]
        ws_cat.append(cat_headers)
        for col_idx in range(1, len(cat_headers) + 1):
            cell = ws_cat.cell(row=1, column=col_idx)
            cell.font = header_font
            cell.fill = header_fill

        cat_items = [it for it in items if it.category_id == cat.id]
        for it in cat_items:
            try:
                vals = json.loads(it.values_json) if it.values_json else {}
            except (json.JSONDecodeError, TypeError):
                vals = {}
            custom_vals = [escape_formula(str(vals.get(f.key, ""))) for f in field_defs]
            ws_cat.append([
                it.id,
                escape_formula(it.name),
                escape_formula(it.location.name if it.location else ""),
                max(1, int(it.quantity or 1)),
                it.expiry_date or "",
            ] + custom_vals)

        ws_cat.freeze_panes = "A2"
        ws_cat.auto_filter.ref = ws_cat.dimensions

    # 3. Sheet: Locations
    ws_loc = wb.create_sheet(title="Locations")
    loc_headers = ["ID", "Name", "Kind", "Parent Location", "Items Count", "Total Units"]
    ws_loc.append(loc_headers)
    for col_idx in range(1, len(loc_headers) + 1):
        cell = ws_loc.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill

    for loc in locations:
        loc_items = [it for it in items if it.location_id == loc.id]
        count = len(loc_items)
        units = sum(max(1, int(it.quantity or 1)) for it in loc_items)
        ws_loc.append([
            loc.id,
            escape_formula(loc.name),
            loc.kind,
            escape_formula(loc.parent.name if loc.parent else ""),
            count,
            units,
        ])
    ws_loc.freeze_panes = "A2"

    # 4. Sheet: Loans (Currently Out)
    ws_loans = wb.create_sheet(title="Loans")
    loan_headers = ["Item ID", "Item Name", "Taken Out Qty", "Total Qty", "Borrower", "Phone", "Since", "Due Date", "Overdue"]
    ws_loans.append(loan_headers)
    for col_idx in range(1, len(loan_headers) + 1):
        cell = ws_loans.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for it in items:
        if it.taken_out:
            borrower = it.taken_by
            phone = ""
            if it.taken_by_profile_id:
                p = profiles_by_id.get(it.taken_by_profile_id)
                if p:
                    borrower = p.name
            elif it.taken_by_contact_id:
                c = contacts_by_id.get(it.taken_by_contact_id)
                if c:
                    borrower = c.name
                    if include_phones:
                        phone = c.phone or ""

            is_overdue = "Yes" if it.taken_due and it.taken_due < today_str else "No"
            qty = max(1, int(it.quantity or 1))
            out_qty = int(it.taken_out_quantity) if it.taken_out_quantity is not None else 1
            ws_loans.append([
                it.id,
                escape_formula(it.name),
                out_qty,
                qty,
                escape_formula(borrower or ""),
                escape_formula(phone),
                it.taken_at[:10] if it.taken_at else "",
                it.taken_due or "",
                is_overdue
            ])
    ws_loans.freeze_panes = "A2"

    # 5. Sheet: Retired Items (if requested)
    if include_retired:
        ws_ret = wb.create_sheet(title="Retired")
        ret_headers = ["ID", "Name", "Category", "Reason", "Date Retired", "Notes", "Retired By"]
        ws_ret.append(ret_headers)
        for col_idx in range(1, len(ret_headers) + 1):
            cell = ws_ret.cell(row=1, column=col_idx)
            cell.font = header_font
            cell.fill = header_fill

        retired_items = db.query(Item).filter(Item.status == "retired", Item.deleted_at.is_(None)).all()
        for it in retired_items:
            ret_by = profiles_by_id.get(it.retired_by) if it.retired_by else None
            ws_ret.append([
                it.id,
                escape_formula(it.name),
                escape_formula(it.category.name if it.category else ""),
                it.retired_reason or "",
                it.retired_on or "",
                escape_formula(it.retired_note or ""),
                escape_formula(ret_by.name if ret_by else ""),
            ])
        ws_ret.freeze_panes = "A2"

    # 6. Sheet: Tags
    ws_tags = wb.create_sheet(title="Tags")
    tag_headers = ["Tag Name", "Color", "Items Count"]
    ws_tags.append(tag_headers)
    for col_idx in range(1, len(tag_headers) + 1):
        cell = ws_tags.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill

    for t in tags:
        ws_tags.append([
            escape_formula(t.name),
            t.color,
            tag_counts.get(t.id, 0)
        ])
    ws_tags.freeze_panes = "A2"

    # Remove initial default empty sheet
    wb.remove(default_sheet)

    # Auto-adjust column widths
    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col[0].column)
            sheet.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)

    record(
        db, "system", "export",
        f"Exported Inventory Book Excel workbook (retired={include_retired}, phones={include_phones})",
        actor=current
    )
    db.commit()

    filename = f"wherezy_book_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/book-data")
def get_printable_book_data(
    group_by: str = Query("location"),  # location | category
    include_retired: bool = Query(False),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:book"))
):
    """Provides structured JSON data for printable /book client rendering."""
    items = items_visible(db).all()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    groups: Dict[str, List[Dict[str, Any]]] = {}

    for it in items:
        grp_name = (it.location.name if it.location else "Unassigned") if group_by == "location" else (it.category.name if it.category else "Uncategorized")
        qty = max(1, int(it.quantity or 1))
        out_qty = int(it.taken_out_quantity) if it.taken_out_quantity is not None else (1 if it.taken_out else 0)
        groups.setdefault(grp_name, []).append({
            "id": it.id,
            "name": it.name,
            "category": it.category.name if it.category else None,
            "location": it.location.name if it.location else None,
            "quantity": qty,
            "expiry_date": it.expiry_date,
            "tags": [t.name for t in it.tags],
            "taken_out": out_qty > 0,
            "taken_out_quantity": out_qty,
            "borrower": it.taken_by,
            "due_date": it.taken_due,
        })

    retired_list = []
    if include_retired:
        rets = db.query(Item).filter(Item.status == "retired", Item.deleted_at.is_(None)).all()
        for r in rets:
            retired_list.append({
                "id": r.id,
                "name": r.name,
                "reason": r.retired_reason,
                "date": r.retired_on,
                "note": r.retired_note
            })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "group_by": group_by,
        "total_active_items": len(items),
        "groups": groups,
        "retired": retired_list if include_retired else []
    }
