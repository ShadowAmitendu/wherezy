"""AI workflows for repetitive inventory tasks: item auto-fill, inbox photo sort, bulk item extraction, and location hierarchy setup."""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from google import genai
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from backend.app.core.config import PHOTOS_DIR
from backend.app.models import Category, FieldDef, Item, Location, Photo, Profile, utc_now_iso
from backend.app.routers.locations import map_location
from backend.app.routers.settings import get_setting_val
from backend.app.schemas import (
    AiBulkCommitRequest,
    AiBulkCommitResponse,
    AiBulkExtractResponse,
    AiBulkItemDraft,
    AiItemSuggestion,
    AiLocationCommitRequest,
    AiLocationCommitResponse,
    AiLocationNodePlan,
    AiLocationPlan,
    LocationOut,
)
from backend.app.services.activity import record
from backend.app.services.form_validator import validate_values
from backend.app.services.gemini_shared import (
    call_gemini_structured,
    inline_json_schema,
    normalize_image_mime_type,
)
from backend.app.services.item_service import map_item_detail
from backend.app.services.location_service import (
    ALLOWED_LOCATION_KINDS,
    LOCATION_KIND_BY_LOWER,
    get_location_path_str,
    is_room_kind,
    validate_location_hierarchy,
)

MAX_AI_BULK_ITEMS = 100
MAX_AI_LOCATIONS = 60

ISO_DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class _GeminiFieldValueEntry(BaseModel):
    key: str = Field(description="Exact custom field key from the chosen category (e.g. 'f_a1b2c3d4').")
    value_text: str = Field(
        default="",
        description="Value formatted as string: text, YYYY-MM-DD for date, numeric string for number, exact option for dropdown, comma-separated options for multiselect, or 'true'/'false' for checkbox.",
    )


class _GeminiSingleItemSchema(BaseModel):
    name: str = Field(description="Concise, clean item name (e.g. 'Paracetamol 500mg', 'Bosch 12V Cordless Drill').")
    category_id: Optional[int] = Field(default=None, description="ID of the best matching existing Wherezy category.")
    location_id: Optional[int] = Field(default=None, description="ID of the best matching existing storage location, or null if unknown.")
    quantity: int = Field(default=1, description="Whole integer quantity (>= 1).")
    expiry_date: str = Field(default="", description="Expiry or warranty date in strict YYYY-MM-DD format if mentioned/visible, else empty string.")
    notes: str = Field(default="", description="Useful concise extra details (serial, brand, dosage notes, packaging) not already covered by custom fields.")
    field_values: List[_GeminiFieldValueEntry] = Field(
        default_factory=list,
        description="Values for active custom fields of the selected category.",
    )
    summary: str = Field(description="1 short sentence summarizing what was extracted.")


class _GeminiBulkItemEntry(BaseModel):
    name: str = Field(description="Clean item name.")
    category_id: Optional[int] = Field(default=None, description="Best matching category ID.")
    location_id: Optional[int] = Field(default=None, description="Best matching storage location ID, or null.")
    quantity: int = Field(default=1, description="Whole number quantity (>= 1).")
    expiry_date: str = Field(default="", description="Date YYYY-MM-DD if known, else empty string.")
    notes: str = Field(default="", description="Optional short item note.")
    field_values: List[_GeminiFieldValueEntry] = Field(
        default_factory=list,
        description="Relevant custom field values for the chosen category.",
    )


class _GeminiBulkItemsSchema(BaseModel):
    summary: str = Field(description="1-2 sentence summary of how many items were extracted and grouped.")
    items: List[_GeminiBulkItemEntry] = Field(description="Distinct inventory items extracted from the voice note, prompt, list, or image.")


class _GeminiLocationNodeSchema(BaseModel):
    temp_id: str = Field(description="Short unique node identifier within this plan, e.g. 'loc_1', 'loc_2'.")
    parent_temp_id: str = Field(default="", description="temp_id of parent node inside this plan, or empty string for top-level/root attachment.")
    name: str = Field(description="Short human-readable location name, e.g. 'Kitchen', 'Top Shelf', 'Red Toolbox'.")
    kind: str = Field(description="Location kind from the allowed list: Room, Storage Room, Garage, Shed, Attic, Basement, Storage Area, Shelf, Cupboard, Closet, Rack, Drawer, Box, Bin, Bag.")
    storage_only: bool = Field(default=False, description="True only when a standalone Room / Storage Room is meant for direct storage with no shelves or sub-areas inside it.")
    notes: str = Field(default="", description="Optional short description or empty string.")


class _GeminiLocationHierarchySchema(BaseModel):
    summary: str = Field(description="1-2 sentence summary of the organized location hierarchy.")
    nodes: List[_GeminiLocationNodeSchema] = Field(description="Parent-before-child ordered list of household storage locations.")


AI_ITEM_JSON_SCHEMA = inline_json_schema(_GeminiSingleItemSchema)
AI_BULK_ITEMS_JSON_SCHEMA = inline_json_schema(_GeminiBulkItemsSchema)
AI_LOCATIONS_JSON_SCHEMA = _build_loc_schema = inline_json_schema(_GeminiLocationHierarchySchema)


def _create_genai_client(api_key: str) -> genai.Client:
    """Factory seam for Google GenAI client (easy to monkeypatch in tests)."""
    return genai.Client(api_key=api_key)


def _load_category_context(db: Session) -> Tuple[List[Category], Dict[int, Category]]:
    categories = (
        db.query(Category)
        .options(selectinload(Category.fields))
        .filter(Category.deleted_at.is_(None), Category.name != "__inbox_unsorted__")
        .order_by(Category.sort_order.asc(), Category.id.asc())
        .all()
    )
    by_id = {c.id: c for c in categories}
    return categories, by_id


def _load_location_context(db: Session) -> Tuple[List[Dict[str, Any]], Dict[int, Dict[str, Any]]]:
    locs = (
        db.query(Location)
        .filter(Location.deleted_at.is_(None))
        .order_by(Location.sort_order.asc(), Location.id.asc())
        .all()
    )
    items: List[Dict[str, Any]] = []
    by_id: Dict[int, Dict[str, Any]] = {}
    for loc in locs:
        path = get_location_path_str(db, loc.id)
        entry = {"id": loc.id, "name": loc.name, "kind": loc.kind, "path": path}
        items.append(entry)
        by_id[loc.id] = entry
    return items, by_id


def _format_categories_prompt(categories: Sequence[Category]) -> str:
    if not categories:
        return "No active categories exist yet."
    lines: List[str] = []
    for cat in categories[:50]:
        active_fields = [f for f in cat.fields if not f.archived]
        field_desc = []
        for f in active_fields[:12]:
            extra = f" ({f.type}"
            if f.unit:
                extra += f", unit={f.unit}"
            if f.options_json:
                try:
                    opts = json.loads(f.options_json)
                    if opts:
                        extra += f", options={opts[:12]}"
                except Exception:
                    pass
            extra += ")"
            field_desc.append(f"{f.key}='{f.label}'{extra}")
        exp_flag = f", track_expiry=true ({cat.expiry_label or 'Expiry date'})" if cat.track_expiry else ""
        lines.append(
            f"- id={cat.id}, name='{cat.name}'{exp_flag}, fields=[{'; '.join(field_desc)}]"
        )
    return "\n".join(lines)


def _format_locations_prompt(locations: Sequence[Dict[str, Any]]) -> str:
    if not locations:
        return "No storage locations exist yet."
    return "\n".join(
        f"- id={loc['id']}, kind='{loc['kind']}', path='{loc['path']}'"
        for loc in locations[:120]
    )


def _parse_number(raw: str) -> Optional[float | int]:
    cleaned = raw.strip().replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    token = match.group(0)
    if "." in token:
        try:
            return float(token)
        except ValueError:
            return None
    try:
        return int(token)
    except ValueError:
        return None


def _coerce_field_values(
    category: Optional[Category],
    entries: Sequence[_GeminiFieldValueEntry],
) -> Dict[str, Any]:
    """Deterministically normalize AI-extracted field values against real FieldDef types & options."""
    if not category:
        return {}

    active_fields = [f for f in category.fields if not f.archived]
    by_key: Dict[str, FieldDef] = {f.key: f for f in active_fields}
    by_label: Dict[str, FieldDef] = {f.label.strip().lower(): f for f in active_fields}

    result: Dict[str, Any] = {}
    for entry in entries:
        raw_key = (entry.key or "").strip()
        field = by_key.get(raw_key) or by_label.get(raw_key.lower())
        if not field:
            continue

        raw_val = (entry.value_text or "").strip()
        if not raw_val:
            continue

        if field.type in ("text", "longtext"):
            result[field.key] = raw_val[:500]
        elif field.type == "number":
            parsed_num = _parse_number(raw_val)
            if parsed_num is not None:
                result[field.key] = parsed_num
        elif field.type == "checkbox":
            low = raw_val.lower()
            if low in ("true", "yes", "y", "1", "checked", "on"):
                result[field.key] = True
            elif low in ("false", "no", "n", "0", "unchecked", "off"):
                result[field.key] = False
        elif field.type == "date":
            date_candidate = raw_val[:10]
            if ISO_DATE_REGEX.match(date_candidate):
                result[field.key] = date_candidate
        elif field.type == "dropdown":
            opts = _parse_field_options(field)
            if opts:
                matched = next((opt for opt in opts if opt.lower() == raw_val.lower()), None)
                if matched:
                    result[field.key] = matched
            else:
                result[field.key] = raw_val[:120]
        elif field.type == "multiselect":
            opts = _parse_field_options(field)
            raw_parts: List[str] = []
            if raw_val.startswith("[") and raw_val.endswith("]"):
                try:
                    loaded = json.loads(raw_val)
                    if isinstance(loaded, list):
                        raw_parts = [str(x).strip() for x in loaded if str(x).strip()]
                except Exception:
                    raw_parts = []
            if not raw_parts:
                raw_parts = [p.strip() for p in re.split(r"[,|;]+", raw_val) if p.strip()]
            if opts:
                opts_lower = {o.lower(): o for o in opts}
                matched_list: List[str] = []
                for part in raw_parts:
                    canon = opts_lower.get(part.lower())
                    if canon and canon not in matched_list:
                        matched_list.append(canon)
                if matched_list:
                    result[field.key] = matched_list
            elif raw_parts:
                result[field.key] = raw_parts[:15]

    return result


def _parse_field_options(field: FieldDef) -> List[str]:
    if not field.options_json:
        return []
    try:
        loaded = json.loads(field.options_json)
        return [str(x) for x in loaded] if isinstance(loaded, list) else []
    except Exception:
        return []


def _sanitize_item_draft(
    raw_name: str,
    raw_category_id: Optional[int],
    raw_location_id: Optional[int],
    raw_quantity: int,
    raw_expiry_date: str,
    raw_notes: str,
    raw_field_values: Sequence[_GeminiFieldValueEntry],
    categories_list: Sequence[Category],
    categories_by_id: Dict[int, Category],
    locations_by_id: Dict[int, Dict[str, Any]],
    *,
    preferred_category_id: Optional[int] = None,
    preferred_location_id: Optional[int] = None,
    lock_category: bool = False,
) -> Tuple[str, Optional[Category], Optional[Dict[str, Any]], int, Optional[str], Optional[str], Dict[str, Any]]:
    clean_name = re.sub(r"\s+", " ", (raw_name or "").strip())[:120] or "Unnamed Item"

    matched_cat: Optional[Category] = None
    if lock_category and preferred_category_id and preferred_category_id in categories_by_id:
        matched_cat = categories_by_id[preferred_category_id]
    elif raw_category_id and raw_category_id in categories_by_id:
        matched_cat = categories_by_id[raw_category_id]
    elif preferred_category_id and preferred_category_id in categories_by_id:
        matched_cat = categories_by_id[preferred_category_id]
    elif categories_list:
        matched_cat = categories_list[0]

    matched_loc: Optional[Dict[str, Any]] = None
    if raw_location_id and raw_location_id in locations_by_id:
        matched_loc = locations_by_id[raw_location_id]
    elif preferred_location_id and preferred_location_id in locations_by_id:
        matched_loc = locations_by_id[preferred_location_id]

    qty = max(1, min(1_000_000, int(raw_quantity or 1)))

    clean_expiry: Optional[str] = None
    exp_candidate = (raw_expiry_date or "").strip()[:10]
    if ISO_DATE_REGEX.match(exp_candidate):
        clean_expiry = exp_candidate

    clean_notes = re.sub(r"\s+", " ", (raw_notes or "").strip())[:500] or None
    coerced_values = _coerce_field_values(matched_cat, raw_field_values)

    return clean_name, matched_cat, matched_loc, qty, clean_expiry, clean_notes, coerced_values


def _require_any_multimodal_input(
    prompt_text: Optional[str],
    audio_bytes: Optional[bytes],
    image_bytes: Optional[bytes],
    empty_message: str,
) -> str:
    cleaned_prompt = (prompt_text or "").strip()
    has_audio = bool(audio_bytes and len(audio_bytes) > 0)
    has_image = bool(image_bytes and len(image_bytes) > 0)
    if not cleaned_prompt and not has_audio and not has_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "EMPTY_AI_INPUT", "message": empty_message}},
        )
    return cleaned_prompt


def _build_item_system_instruction(
    categories: Sequence[Category],
    locations: Sequence[Dict[str, Any]],
    *,
    preferred_category_id: Optional[int] = None,
    preferred_location_id: Optional[int] = None,
    bulk_mode: bool = False,
) -> str:
    task_scope = (
        "Extract EVERY distinct household inventory item from the user's photo, voice clip, receipt, or text list."
        if bulk_mode
        else "Extract structured household item metadata from the user's photo, voice clip, and/or text note."
    )
    hints: List[str] = []
    if preferred_category_id:
        hints.append(f"Preferred/locked category_id hint from UI: {preferred_category_id}.")
    if preferred_location_id:
        hints.append(f"Default/fallback location_id hint from UI: {preferred_location_id}.")
    hint_line = ("\n" + " ".join(hints)) if hints else ""

    return (
        "You are an intelligent home inventory assistant for Wherezy.\n"
        f"{task_scope}\n\n"
        "EXISTING HOUSEHOLD CATEGORIES AND THEIR CUSTOM FIELD SCHEMAS:\n"
        f"{_format_categories_prompt(categories)}\n\n"
        "EXISTING HOUSEHOLD STORAGE LOCATIONS:\n"
        f"{_format_locations_prompt(locations)}{hint_line}\n\n"
        "RULES:\n"
        "1. Pick exact integer category_id and location_id from the lists above (use null for location_id only if genuinely unclear and no default was hinted).\n"
        "2. Set quantity to an integer >= 1 matching packs/units mentioned or visible.\n"
        "3. If an expiry date, best-before date, or warranty date is visible or spoken, format it strictly as YYYY-MM-DD in expiry_date; otherwise empty string.\n"
        "4. Populate field_values using the exact 'key' (e.g. 'f_xxxxxxxx') from the selected category's custom fields whenever clearly inferable. "
        "For dropdown fields use one of the exact listed options; for multiselect join matched options with ', '; for checkbox use 'true' or 'false'; for number use digits cleanly without units.\n"
        "5. Keep item names clean, readable, and properly capitalized (no trailing quantities in the name when captured in quantity)."
    )


def extract_item_plan(
    db: Session,
    *,
    prompt_text: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
    audio_mime_type: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
    image_mime_type: Optional[str] = None,
    preferred_category_id: Optional[int] = None,
    preferred_location_id: Optional[int] = None,
) -> AiItemSuggestion:
    """Analyze voice, image, and/or text prompt to auto-fill a single inventory item form."""
    cleaned_prompt = _require_any_multimodal_input(
        prompt_text,
        audio_bytes,
        image_bytes,
        "Please enter details, record a voice message, or attach an item photo.",
    )

    categories, categories_by_id = _load_category_context(db)
    locations, locations_by_id = _load_location_context(db)

    parts: List[str] = []
    if image_bytes:
        parts.append("Inspect the attached product/label image carefully (brand, model, quantity, specs, dates).")
    if audio_bytes:
        parts.append("Listen to the attached voice message describing this item and where it belongs.")
    if cleaned_prompt:
        parts.append(f"User description: {cleaned_prompt}")
    if not cleaned_prompt:
        parts.append("Extract clean item fields matching the Wherezy schemas.")

    parsed = call_gemini_structured(
        db,
        response_model=_GeminiSingleItemSchema,
        json_schema=AI_ITEM_JSON_SCHEMA,
        system_instruction=_build_item_system_instruction(
            categories,
            locations,
            preferred_category_id=preferred_category_id,
            preferred_location_id=preferred_location_id,
            bulk_mode=False,
        ),
        text_prompt="\n".join(parts),
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime_type,
        image_bytes=image_bytes,
        image_mime_type=image_mime_type,
        temperature=0.15,
        max_output_tokens=2048,
        client_factory=_create_genai_client,
    )

    name, cat, loc, qty, expiry, notes, values = _sanitize_item_draft(
        parsed.name,
        parsed.category_id,
        parsed.location_id,
        parsed.quantity,
        parsed.expiry_date,
        parsed.notes,
        parsed.field_values,
        categories,
        categories_by_id,
        locations_by_id,
        preferred_category_id=preferred_category_id,
        preferred_location_id=preferred_location_id,
    )
    summary = re.sub(r"\s+", " ", (parsed.summary or "").strip())[:240] or f"Extracted details for {name}."

    return AiItemSuggestion(
        name=name,
        category_id=cat.id if cat else None,
        category_name=cat.name if cat else None,
        location_id=loc["id"] if loc else None,
        location_path=loc["path"] if loc else None,
        quantity=qty,
        expiry_date=expiry,
        notes=notes,
        values=values,
        summary=summary,
    )


def analyze_inbox_item(
    db: Session,
    item_id: int,
    *,
    prompt_text: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
    audio_mime_type: Optional[str] = None,
) -> AiItemSuggestion:
    """Analyze an inbox item's saved cover photo (and optional voice/prompt) into structured fields."""
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.status == "inbox", Item.deleted_at.is_(None))
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Inbox item not found"}},
        )

    cover_photo = (
        db.query(Photo)
        .filter(Photo.owner_type == "item", Photo.owner_id == item.id)
        .order_by(Photo.is_cover.desc(), Photo.sort_order.asc(), Photo.id.asc())
        .first()
    )

    image_bytes: Optional[bytes] = None
    image_mime: Optional[str] = None
    if cover_photo:
        photos_root = PHOTOS_DIR.resolve()
        candidate = (PHOTOS_DIR / "item" / str(item.id) / Path(cover_photo.file_name).name).resolve()
        if candidate.is_relative_to(photos_root) and candidate.is_file():
            image_bytes = candidate.read_bytes()
            image_mime = normalize_image_mime_type(None, cover_photo.file_name)

    return extract_item_plan(
        db,
        prompt_text=prompt_text,
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime_type,
        image_bytes=image_bytes,
        image_mime_type=image_mime,
        preferred_location_id=item.location_id,
    )


def extract_bulk_items_plan(
    db: Session,
    *,
    prompt_text: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
    audio_mime_type: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
    image_mime_type: Optional[str] = None,
    preferred_category_id: Optional[int] = None,
    preferred_location_id: Optional[int] = None,
    lock_category: bool = False,
) -> AiBulkExtractResponse:
    """Extract a structured list of items from a voice clip, text dump, receipt, or shelf photo."""
    cleaned_prompt = _require_any_multimodal_input(
        prompt_text,
        audio_bytes,
        image_bytes,
        "Please paste/type a list, record a voice message, or upload a shelf/receipt photo.",
    )

    categories, categories_by_id = _load_category_context(db)
    locations, locations_by_id = _load_location_context(db)

    parts: List[str] = []
    if image_bytes:
        parts.append("Identify all distinct inventory items visible in this image (or listed on this receipt/label).")
    if audio_bytes:
        parts.append("Listen to the attached voice recording and break it down into separate structured inventory items.")
    if cleaned_prompt:
        parts.append(f"User list / notes:\n{cleaned_prompt}")
    if lock_category and preferred_category_id:
        parts.append(f"All items should be placed in category_id={preferred_category_id}.")

    parsed = call_gemini_structured(
        db,
        response_model=_GeminiBulkItemsSchema,
        json_schema=AI_BULK_ITEMS_JSON_SCHEMA,
        system_instruction=_build_item_system_instruction(
            categories,
            locations,
            preferred_category_id=preferred_category_id,
            preferred_location_id=preferred_location_id,
            bulk_mode=True,
        ),
        text_prompt="\n".join(parts),
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime_type,
        image_bytes=image_bytes,
        image_mime_type=image_mime_type,
        temperature=0.15,
        max_output_tokens=6144,
        client_factory=_create_genai_client,
    )

    drafts: List[AiBulkItemDraft] = []
    for raw_item in parsed.items[:MAX_AI_BULK_ITEMS]:
        name, cat, loc, qty, expiry, notes, values = _sanitize_item_draft(
            raw_item.name,
            raw_item.category_id,
            raw_item.location_id,
            raw_item.quantity,
            raw_item.expiry_date,
            raw_item.notes,
            raw_item.field_values,
            categories,
            categories_by_id,
            locations_by_id,
            preferred_category_id=preferred_category_id,
            preferred_location_id=preferred_location_id,
            lock_category=lock_category,
        )
        drafts.append(
            AiBulkItemDraft(
                name=name,
                category_id=cat.id if cat else None,
                category_name=cat.name if cat else None,
                location_id=loc["id"] if loc else None,
                location_path=loc["path"] if loc else None,
                quantity=qty,
                expiry_date=expiry,
                notes=notes,
                values=values,
            )
        )

    summary = (
        re.sub(r"\s+", " ", (parsed.summary or "").strip())[:280]
        or f"Extracted {len(drafts)} inventory item(s)."
    )
    return AiBulkExtractResponse(summary=summary, items=drafts)


def commit_bulk_ai_items(
    db: Session,
    payload: AiBulkCommitRequest,
    actor: Optional[Profile] = None,
) -> AiBulkCommitResponse:
    """Atomically create reviewed AI-extracted items across categories and locations."""
    if not payload.items:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "At least one item is required"}},
        )
    if len(payload.items) > MAX_AI_BULK_ITEMS:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "VALIDATION_ERROR", "message": f"Maximum {MAX_AI_BULK_ITEMS} items per AI batch"}},
        )

    cat_ids = {entry.category_id for entry in payload.items}
    categories = (
        db.query(Category)
        .options(selectinload(Category.fields))
        .filter(Category.id.in_(cat_ids), Category.deleted_at.is_(None))
        .all()
    )
    cat_by_id = {c.id: c for c in categories}
    missing_cats = cat_ids - set(cat_by_id.keys())
    if missing_cats:
        raise HTTPException(status_code=404, detail={"error": {"code": "CATEGORY_NOT_FOUND", "message": "Category not found"}})

    loc_ids = {entry.location_id for entry in payload.items if entry.location_id}
    if loc_ids:
        existing_locs = {
            lid
            for (lid,) in db.query(Location.id).filter(Location.id.in_(loc_ids), Location.deleted_at.is_(None)).all()
        }
        if not loc_ids.issubset(existing_locs):
            raise HTTPException(status_code=404, detail={"error": {"code": "LOCATION_NOT_FOUND", "message": "Location not found"}})

    prepared: List[Tuple[dict, str]] = []
    for idx, entry in enumerate(payload.items):
        clean_name = entry.name.strip()
        if not clean_name:
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "VALIDATION_ERROR", "message": f"Item #{idx + 1} name cannot be empty"}},
            )
        category = cat_by_id[entry.category_id]
        clean_vals = validate_values(category, entry.values)
        clean_expiry = (
            entry.expiry_date.strip()
            if (entry.expiry_date and entry.expiry_date.strip() and category.track_expiry)
            else None
        )
        clean_notes = entry.notes.strip() if (entry.notes and entry.notes.strip()) else None
        prepared.append(
            (
                {
                    "name": clean_name[:120],
                    "category_id": category.id,
                    "location_id": entry.location_id if entry.location_id else None,
                    "quantity": max(1, int(entry.quantity or 1)),
                    "taken_out": 0,
                    "taken_out_quantity": 0,
                    "expiry_date": clean_expiry,
                    "notes": clean_notes,
                    "values_json": json.dumps(clean_vals),
                    "status": "active",
                },
                category.name,
            )
        )

    batch_id = str(uuid.uuid4())
    now = utc_now_iso()
    created_items: List[Tuple[Item, str]] = []
    for row_data, cat_name in prepared:
        item = Item(**row_data, created_at=now, updated_at=now)
        db.add(item)
        created_items.append((item, cat_name))

    db.flush()
    for item, cat_name in created_items:
        record(
            db,
            "item",
            "created",
            f"AI bulk added '{item.name}' in '{cat_name}'",
            entity_id=item.id,
            actor=actor,
            batch_id=batch_id,
        )

    db.commit()
    for item, _ in created_items:
        db.refresh(item)

    warn_days = int(get_setting_val(db, "expiry_warn_days", 30))
    return AiBulkCommitResponse(
        ok=True,
        created_count=len(created_items),
        batch_id=batch_id,
        items=[map_item_detail(item, db, warn_days) for item, _ in created_items],
    )


def _sanitize_location_nodes(raw_nodes: Sequence[Any]) -> List[AiLocationNodePlan]:
    """Normalize location nodes, enforce valid kinds, break cycles, and return parent-before-child order."""
    normalized: List[AiLocationNodePlan] = []
    seen_ids: set[str] = set()

    for idx, node in enumerate(raw_nodes[:MAX_AI_LOCATIONS], start=1):
        clean_name = re.sub(r"\s+", " ", (getattr(node, "name", "") or "").strip())[:80]
        if not clean_name:
            continue

        raw_id = re.sub(r"[^a-zA-Z0-9_-]", "", (getattr(node, "temp_id", "") or "").strip())[:32]
        temp_id = raw_id if raw_id and raw_id not in seen_ids else f"loc_{idx}"
        while temp_id in seen_ids:
            temp_id = f"{temp_id}_{idx}"
        seen_ids.add(temp_id)

        raw_parent = re.sub(r"[^a-zA-Z0-9_-]", "", (getattr(node, "parent_temp_id", None) or "").strip())[:32]
        raw_kind = re.sub(r"\s+", " ", (getattr(node, "kind", "") or "").strip())
        clean_kind = LOCATION_KIND_BY_LOWER.get(raw_kind.lower(), "Room")
        clean_notes = re.sub(r"\s+", " ", (getattr(node, "notes", None) or "").strip())[:240] or None

        normalized.append(
            AiLocationNodePlan(
                temp_id=temp_id,
                parent_temp_id=raw_parent or None,
                name=clean_name,
                kind=clean_kind,
                storage_only=bool(getattr(node, "storage_only", False)) and is_room_kind(clean_kind),
                notes=clean_notes,
            )
        )

    by_id = {n.temp_id: n for n in normalized}
    for n in normalized:
        if n.parent_temp_id == n.temp_id or (n.parent_temp_id and n.parent_temp_id not in by_id):
            n.parent_temp_id = None
        elif is_room_kind(n.kind) and n.parent_temp_id and not is_room_kind(by_id[n.parent_temp_id].kind):
            # Enforce Room as a higher grouping element above shelves/storage areas
            n.parent_temp_id = None

    referenced_parents = {n.parent_temp_id for n in normalized if n.parent_temp_id}
    for n in normalized:
        if n.temp_id in referenced_parents or not is_room_kind(n.kind):
            n.storage_only = False

    # Topological parent-first sort with explicit cycle breaking
    ordered: List[AiLocationNodePlan] = []
    state: Dict[str, int] = {}  # 0=unvisited, 1=visiting, 2=done

    def visit(node: AiLocationNodePlan) -> None:
        st = state.get(node.temp_id, 0)
        if st == 2:
            return
        if st == 1:
            # Break cycle cleanly at this node
            node.parent_temp_id = None
            return
        state[node.temp_id] = 1
        if node.parent_temp_id and node.parent_temp_id in by_id:
            parent_node = by_id[node.parent_temp_id]
            if state.get(parent_node.temp_id, 0) == 1:
                node.parent_temp_id = None
            else:
                visit(parent_node)
        state[node.temp_id] = 2
        ordered.append(node)

    for node in normalized:
        visit(node)

    return ordered


def generate_location_hierarchy_plan(
    db: Session,
    *,
    prompt_text: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
    audio_mime_type: Optional[str] = None,
    root_parent_id: Optional[int] = None,
) -> AiLocationPlan:
    """Generate a nested storage location hierarchy from a prompt or voice recording."""
    cleaned_prompt = _require_any_multimodal_input(
        prompt_text,
        audio_bytes,
        None,
        "Please describe your rooms/shelves/boxes or record a voice note.",
    )

    locations, locations_by_id = _load_location_context(db)
    root_desc = "Top level (new root locations)"
    if root_parent_id:
        if root_parent_id not in locations_by_id:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "PARENT_NOT_FOUND", "message": "Parent location not found"}},
            )
        root_desc = f"Nested inside existing location '{locations_by_id[root_parent_id]['path']}'"

    system_instruction = (
        "You are an expert home organization planner for Wherezy.\n"
        "Convert the user's description or voice recording into a clean nested storage location tree.\n\n"
        f"TARGET ATTACHMENT ROOT: {root_desc}\n"
        f"EXISTING LOCATIONS IN HOME:\n{_format_locations_prompt(locations)}\n\n"
        f"ALLOWED LOCATION KINDS: {', '.join(ALLOWED_LOCATION_KINDS)}\n\n"
        "RULES:\n"
        "1. Output a parent-before-child flat list of nodes linked via temp_id and parent_temp_id (empty string means attach directly to TARGET ATTACHMENT ROOT).\n"
        "2. Treat Rooms & standalone spaces (Room, Storage Room, Garage, Shed, Attic, Basement) as the higher grouping level at top level (`parent_temp_id = \"\"`) above Shelves, Storage Areas, Cupboards, Closets, Racks, Drawers, and Boxes.\n"
        "3. A Room can contain multiple shelves or storage areas (`kind='Shelf'`, `'Storage Area'`, etc.), OR stand alone as a separate storage-only place (`storage_only=true`, no child nodes) when no sub-shelves are needed.\n"
        "4. Expand compact descriptions naturally (e.g., '3 pantry shelves' -> 'Shelf 1', 'Shelf 2', 'Shelf 3' each with kind='Shelf' inside 'Pantry').\n"
        "5. Use the exact most fitting 'kind' from ALLOWED LOCATION KINDS and keep at most 60 clean, practical nodes."
    )

    parts: List[str] = []
    if audio_bytes:
        parts.append("Listen carefully to the voice recording describing the rooms, cabinets, shelves, and containers.")
    if cleaned_prompt:
        parts.append(f"User description: {cleaned_prompt}")
    if not cleaned_prompt:
        parts.append("Create the clean nested storage hierarchy described in the voice note.")

    parsed = call_gemini_structured(
        db,
        response_model=_GeminiLocationHierarchySchema,
        json_schema=AI_LOCATIONS_JSON_SCHEMA,
        system_instruction=system_instruction,
        text_prompt="\n".join(parts),
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime_type,
        temperature=0.2,
        max_output_tokens=4096,
        client_factory=_create_genai_client,
    )

    nodes = _sanitize_location_nodes(parsed.nodes)
    summary = re.sub(r"\s+", " ", (parsed.summary or "").strip())[:280] or f"Planned {len(nodes)} storage locations."
    return AiLocationPlan(summary=summary, nodes=nodes)


def commit_location_hierarchy(
    db: Session,
    payload: AiLocationCommitRequest,
    actor: Optional[Profile] = None,
) -> AiLocationCommitResponse:
    """Persist an approved AI location hierarchy atomically under optional root_parent_id."""
    if payload.root_parent_id:
        parent = (
            db.query(Location)
            .filter(Location.id == payload.root_parent_id, Location.deleted_at.is_(None))
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "PARENT_NOT_FOUND", "message": "Parent location not found"}},
            )

    ordered_nodes = _sanitize_location_nodes(payload.nodes)
    if not ordered_nodes:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "At least one location node is required"}},
        )

    parent_ids_used = {n.parent_temp_id for n in ordered_nodes if n.parent_temp_id}
    temp_to_db_id: Dict[str, int] = {}
    created_models: List[Location] = []

    for node in ordered_nodes:
        parent_id = (
            temp_to_db_id.get(node.parent_temp_id)
            if node.parent_temp_id
            else payload.root_parent_id
        )
        parent_obj = validate_location_hierarchy(db, node.kind, parent_id)
        if parent_obj and getattr(parent_obj, "storage_only", 0):
            parent_obj.storage_only = 0
            parent_obj.updated_at = utc_now_iso()
        max_sort = (
            db.query(func.max(Location.sort_order))
            .filter(Location.parent_id == parent_id, Location.deleted_at.is_(None))
            .scalar()
            or 0
        )
        is_storage_only = (
            1
            if (node.storage_only and is_room_kind(node.kind) and node.temp_id not in parent_ids_used)
            else 0
        )
        loc = Location(
            name=node.name,
            kind=node.kind,
            storage_only=is_storage_only,
            notes=node.notes,
            parent_id=parent_id,
            sort_order=max_sort + 1,
        )
        db.add(loc)
        db.flush()
        temp_to_db_id[node.temp_id] = loc.id
        created_models.append(loc)

    record(
        db=db,
        entity_type="location",
        action="created",
        summary=f"Created {len(created_models)} locations via AI hierarchy planner",
        entity_id=created_models[0].id,
        actor=actor,
    )
    db.commit()

    out_locations: List[LocationOut] = []
    for loc in created_models:
        db.refresh(loc)
        out_locations.append(map_location(loc, db, 0))

    return AiLocationCommitResponse(
        ok=True,
        created_count=len(out_locations),
        locations=out_locations,
    )
