import json
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from google import genai
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.models import Category, FieldDef, Profile
from backend.app.routers.categories import map_category, map_field
from backend.app.schemas import (
    AiCategoryCommitRequest,
    AiCategoryFieldPlan,
    AiCategoryPlan,
    CategoryDetailOut,
    FieldType,
)
from backend.app.services.activity import record
from backend.app.services.form_validator import generate_field_key
from backend.app.services.gemini_shared import (  # noqa: F401 - re-exported for compatibility
    GEMINI_MODEL,
    GEMINI_SETTING_KEY,
    MAX_AUDIO_BYTES,
    call_gemini_structured,
    clear_gemini_api_key,
    get_gemini_key_info,
    inline_json_schema,
    mask_api_key,
    normalize_audio_mime_type,
    save_gemini_api_key,
)

MAX_FIELDS_PER_CATEGORY = 10
MAX_SHOW_IN_LIST = 4

CURATED_ICONS: Tuple[str, ...] = (
    "medication",
    "lightbulb",
    "construction",
    "description",
    "kitchen",
    "devices",
    "checkroom",
    "localshipping",
    "inventory",
    "home",
    "folder",
    "book",
    "sportsesports",
    "fitnesscenter",
    "pets",
    "palette",
    "musicnote",
    "cameraalt",
    "chair",
    "build",
    "weekend",
    "bed",
    "cleanhands",
    "electricalservices",
    "directionscar",
    "luggage",
    "watch",
    "localpharmacy",
    "science",
    "school",
    "localdrink",
    "fastfood",
    "shield",
    "localoffer",
    "grade",
    "category",
    "tv",
    "headphones",
    "smartphone",
    "laptop",
    "router",
    "print",
    "batterychargingfull",
    "restaurant",
    "coffeemaker",
    "blender",
    "locallaundryservice",
    "handyman",
    "plumbing",
    "yard",
    "outdoorgrill",
    "key",
    "diamond",
    "childfriendly",
    "toys",
    "menubook",
    "medicalservices",
    "twowheeler",
    "shoppingbag",
    "acunit",
)
CURATED_ICON_SET = frozenset(CURATED_ICONS)

CURATED_COLORS: Tuple[str, ...] = (
    "#1976d2",
    "#486B85",
    "#02435C",
    "#57B5C3",
    "#2e7d32",
    "#388e3c",
    "#ed6c02",
    "#9c27b0",
    "#d32f2f",
    "#455a64",
    "#5d4037",
)
CURATED_COLOR_BY_LOWER: Dict[str, str] = {c.lower(): c for c in CURATED_COLORS}

BUILTIN_REDUNDANT_LABELS = frozenset({
    "name",
    "item name",
    "title",
    "location",
    "storage location",
    "quantity",
    "qty",
    "count",
    "notes",
    "note",
    "description",
    "photo",
    "photos",
    "image",
    "images",
    "tags",
    "tag",
})

EXPIRY_REDUNDANT_LABELS = frozenset({
    "expiry",
    "expiry date",
    "expiration",
    "expiration date",
    "best before",
    "use by",
})


class _GeminiFieldSchema(BaseModel):
    """Flat field definition schema optimized for Gemini constrained decoding."""

    label: str = Field(description="Concise human-readable field label (2-30 chars).")
    type: FieldType = Field(description="Best Wherezy input type for this field.")
    required: bool = Field(default=False, description="True only if almost every item in this category requires it.")
    options: List[str] = Field(
        default_factory=list,
        description="Non-empty list of concise choices ONLY when type is 'dropdown' or 'multiselect'; otherwise empty list.",
    )
    unit: str = Field(default="", description="Short numeric unit suffix such as 'mg', 'W', 'ml', 'GB', or empty string.")
    hint: str = Field(default="", description="Short helper placeholder for users filling this field, or empty string.")
    show_in_list: bool = Field(default=False, description="True only for the 1-3 highest-value fields to display in table columns.")


class _GeminiCategorySchema(BaseModel):
    """Flat category optimization schema for Gemini constrained decoding."""

    name: str = Field(description="Clean, concise title-cased category name.")
    icon: str = Field(description="Exact icon id from the allowed Wherezy icon list.")
    color: str = Field(description="Exact hex color from the allowed Wherezy color palette.")
    track_expiry: bool = Field(description="True if items spoil, expire, or have warranty/renewal dates.")
    expiry_label: str = Field(default="", description="Expiry label when track_expiry is true (e.g. 'Expiry date', 'Warranty till'), or empty string.")
    optimization_summary: str = Field(description="Brief 1-2 sentence explanation of how the category structure and fields were optimized.")
    fields: List[_GeminiFieldSchema] = Field(description="3 to 8 high-signal, non-redundant custom fields ordered by importance.")


def _build_category_json_schema() -> Dict[str, Any]:
    schema = inline_json_schema(_GeminiCategorySchema)
    props = schema.get("properties", {})
    if "icon" in props:
        props["icon"]["enum"] = list(CURATED_ICONS)
    if "color" in props:
        props["color"]["enum"] = list(CURATED_COLORS)
    return schema


AI_CATEGORY_JSON_SCHEMA = _build_category_json_schema()


def _sanitize_plan_values(
    raw_name: Optional[str],
    raw_icon: Optional[str],
    raw_color: Optional[str],
    raw_track_expiry: bool,
    raw_expiry_label: Optional[str],
    raw_summary: Optional[str],
    raw_fields: Sequence[Any],
    strip_builtin_fields: bool = True,
    allow_custom_icon: bool = False,
) -> AiCategoryPlan:
    """Validate, deduplicate, and normalize category plan data against Wherezy invariants."""
    clean_name = re.sub(r"\s+", " ", (raw_name or "").strip())[:60] or "Custom Category"

    norm_icon = (raw_icon or "").replace("_", "").replace("-", "").strip().lower()
    if norm_icon in CURATED_ICON_SET:
        clean_icon = norm_icon
    elif allow_custom_icon and re.fullmatch(r"[a-z0-9]{1,80}", norm_icon):
        clean_icon = norm_icon
    else:
        clean_icon = "category"

    norm_color = (raw_color or "").strip().lower()
    clean_color = CURATED_COLOR_BY_LOWER.get(norm_color, "#1976d2")

    track_expiry = bool(raw_track_expiry)
    expiry_label: Optional[str] = None
    if track_expiry:
        clean_exp = re.sub(r"\s+", " ", (raw_expiry_label or "").strip())[:40]
        expiry_label = clean_exp or "Expiry date"

    summary = re.sub(r"\s+", " ", (raw_summary or "").strip())[:280]
    if not summary:
        summary = "Optimized category icon, expiry tracking, and structured custom fields."

    seen_labels: set[str] = set()
    clean_fields: List[AiCategoryFieldPlan] = []
    list_columns_count = 0

    for field in raw_fields:
        if len(clean_fields) >= MAX_FIELDS_PER_CATEGORY:
            break

        label = re.sub(r"\s+", " ", (getattr(field, "label", "") or "").strip())[:48]
        if not label:
            continue

        norm_label = label.lower()
        if strip_builtin_fields:
            if norm_label in BUILTIN_REDUNDANT_LABELS:
                continue
            if track_expiry and norm_label in EXPIRY_REDUNDANT_LABELS:
                continue
        if norm_label in seen_labels:
            continue
        seen_labels.add(norm_label)

        field_type: FieldType = field.type
        clean_options: Optional[List[str]] = None
        if field_type in ("dropdown", "multiselect"):
            dedup_opts: List[str] = []
            seen_opts: set[str] = set()
            for opt in getattr(field, "options", None) or []:
                cleaned_opt = re.sub(r"\s+", " ", str(opt).strip())[:48]
                if cleaned_opt and cleaned_opt.lower() not in seen_opts:
                    seen_opts.add(cleaned_opt.lower())
                    dedup_opts.append(cleaned_opt)
                if len(dedup_opts) >= 25:
                    break
            if dedup_opts:
                clean_options = dedup_opts
            else:
                field_type = "text"

        unit: Optional[str] = None
        if field_type == "number":
            clean_unit = re.sub(r"\s+", " ", (getattr(field, "unit", None) or "").strip())[:16]
            unit = clean_unit or None

        clean_hint = re.sub(r"\s+", " ", (getattr(field, "hint", None) or "").strip())[:100]
        hint = clean_hint or None

        show_in_list = bool(getattr(field, "show_in_list", False)) and list_columns_count < MAX_SHOW_IN_LIST
        if show_in_list:
            list_columns_count += 1

        clean_fields.append(
            AiCategoryFieldPlan(
                label=label,
                type=field_type,
                required=bool(getattr(field, "required", False)),
                options=clean_options,
                unit=unit,
                hint=hint,
                show_in_list=show_in_list,
            )
        )

    return AiCategoryPlan(
        name=clean_name,
        icon=clean_icon,
        color=clean_color,
        track_expiry=track_expiry,
        expiry_label=expiry_label,
        optimization_summary=summary,
        fields=clean_fields,
    )


def sanitize_ai_plan(raw: _GeminiCategorySchema) -> AiCategoryPlan:
    """Validate and normalize Gemini output against Wherezy invariants."""
    return _sanitize_plan_values(
        raw_name=raw.name,
        raw_icon=raw.icon,
        raw_color=raw.color,
        raw_track_expiry=raw.track_expiry,
        raw_expiry_label=raw.expiry_label,
        raw_summary=raw.optimization_summary,
        raw_fields=raw.fields,
        strip_builtin_fields=True,
    )


def sanitize_commit_request(payload: AiCategoryCommitRequest) -> AiCategoryPlan:
    """Validate and normalize user-reviewed category payload before persistence."""
    return _sanitize_plan_values(
        raw_name=payload.name,
        raw_icon=payload.icon,
        raw_color=payload.color,
        raw_track_expiry=payload.track_expiry,
        raw_expiry_label=payload.expiry_label,
        raw_summary="User-reviewed AI category configuration.",
        raw_fields=payload.fields,
        strip_builtin_fields=False,
        allow_custom_icon=True,
    )


def _create_genai_client(api_key: str) -> genai.Client:
    """Factory seam for instantiating the Google GenAI client (preserved for test monkeypatching)."""
    return genai.Client(api_key=api_key)


def _build_system_instruction(existing_names: Sequence[str]) -> str:
    existing_clause = ", ".join(existing_names[:40]) if existing_names else "None yet"
    return (
        "You are an expert home inventory architect for Wherezy.\n"
        "Turn the user's text prompt and/or voice message into a clean, practical, well-structured inventory category.\n\n"
        "IMPORTANT OPTIMIZATION RULES:\n"
        "1. Every item in Wherezy ALREADY has built-in fields: Item Name, Location, Quantity, Tags, Notes, Photos, and (if track_expiry=true) Expiry Date. "
        "NEVER recreate those as custom fields.\n"
        "2. Pick a concise, natural, title-cased plural category name (e.g., 'Kitchen Spices', 'Camera Gear', 'Board Games').\n"
        f"   Existing categories in this household: [{existing_clause}]. Avoid confusing overlap unless the user specifically asks.\n"
        "3. Pick the single best icon from the curated enum and a matching hex color from the curated enum.\n"
        "4. Enable track_expiry=true ONLY when items genuinely spoil, expire, need service, or have warranties/renewals; provide a tailored expiry_label (e.g., 'Best before', 'Warranty till', 'Expiry date', 'Valid till').\n"
        "5. Design 3 to 8 high-signal custom fields ordered most-important first:\n"
        "   - Prefer 'dropdown' or 'multiselect' with practical household options when values are standardized (sizes, conditions, types, mounts, allergens).\n"
        "   - Use 'number' with an explicit short 'unit' (e.g., 'g', 'ml', 'W', 'V', 'GB', 'mm') instead of mixing numbers and units inside text.\n"
        "   - Use 'checkbox' for clean boolean attributes.\n"
        "   - Mark at most 2 or 3 essential scanning attributes with show_in_list=true.\n"
        "   - Keep required=true rare (only fields almost always known at entry time).\n"
        "6. In optimization_summary, write 1-2 short sentences explaining how you structured the category and fields."
    )


def generate_ai_category_plan(
    db: Session,
    prompt_text: Optional[str],
    audio_bytes: Optional[bytes] = None,
    audio_mime_type: Optional[str] = None,
) -> AiCategoryPlan:
    """Analyze a text prompt and/or voice recording with Gemini and return a sanitized CategoryPlan."""
    cleaned_prompt = (prompt_text or "").strip()
    has_audio = bool(audio_bytes and len(audio_bytes) > 0)

    if not cleaned_prompt and not has_audio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "EMPTY_AI_INPUT",
                    "message": "Please enter a prompt or record/upload a voice message describing the category.",
                }
            },
        )

    existing_names = [
        row[0]
        for row in db.query(Category.name).filter(Category.deleted_at.is_(None)).order_by(Category.name).all()
    ]

    instruction_parts: List[str] = []
    if has_audio:
        instruction_parts.append(
            "Listen carefully to the user's attached voice message describing what they want to organize."
        )
    if cleaned_prompt:
        instruction_parts.append(f"User instructions: {cleaned_prompt}")
    if not cleaned_prompt:
        instruction_parts.append(
            "Design the optimal Wherezy category, icon, color, expiry tracking, and custom fields based on the voice message."
        )
    else:
        instruction_parts.append(
            "Optimize this request into the ideal Wherezy category schema."
        )

    parsed = call_gemini_structured(
        db,
        response_model=_GeminiCategorySchema,
        json_schema=AI_CATEGORY_JSON_SCHEMA,
        system_instruction=_build_system_instruction(existing_names),
        text_prompt="\n".join(instruction_parts),
        audio_bytes=audio_bytes if has_audio else None,
        audio_mime_type=audio_mime_type,
        temperature=0.2,
        max_output_tokens=2048,
        client_factory=_create_genai_client,
    )
    return sanitize_ai_plan(parsed)


def _unique_category_name(db: Session, base_name: str) -> str:
    """Resolve a case-insensitively unique category name across all rows in categories."""
    candidate = base_name.strip() or "Custom Category"
    if not db.query(Category).filter(func.lower(Category.name) == candidate.lower()).first():
        return candidate
    idx = 2
    while db.query(Category).filter(func.lower(Category.name) == f"{candidate} ({idx})".lower()).first():
        idx += 1
    return f"{candidate} ({idx})"


def create_category_from_plan(
    db: Session,
    plan: AiCategoryPlan,
    actor: Optional[Profile] = None,
) -> CategoryDetailOut:
    """Persist an AI-optimized category and its ordered custom fields atomically."""
    name = _unique_category_name(db, plan.name)
    max_sort = db.query(func.max(Category.sort_order)).scalar() or 0

    cat = Category(
        name=name,
        icon=plan.icon,
        color=plan.color,
        track_expiry=1 if plan.track_expiry else 0,
        expiry_label=plan.expiry_label if plan.track_expiry else None,
        sort_order=max_sort + 1,
    )
    db.add(cat)
    db.flush()

    field_defs: List[FieldDef] = []
    list_columns_count = 0
    for order, f_data in enumerate(plan.fields[:MAX_FIELDS_PER_CATEGORY], start=1):
        show_in_list = bool(f_data.show_in_list) and list_columns_count < MAX_SHOW_IN_LIST
        if show_in_list:
            list_columns_count += 1

        field_type = f_data.type
        options = f_data.options if field_type in ("dropdown", "multiselect") and f_data.options else None
        if field_type in ("dropdown", "multiselect") and not options:
            field_type = "text"

        f_row = FieldDef(
            category_id=cat.id,
            key=generate_field_key(),
            label=f_data.label.strip(),
            type=field_type,
            required=1 if f_data.required else 0,
            options_json=json.dumps(options) if options else None,
            unit=f_data.unit.strip() if (field_type == "number" and f_data.unit) else None,
            hint=f_data.hint.strip() if f_data.hint else None,
            sort_order=order,
            show_in_list=1 if show_in_list else 0,
            archived=0,
        )
        db.add(f_row)
        field_defs.append(f_row)

    record(
        db=db,
        entity_type="category",
        action="created",
        summary=f"Created AI-optimized category '{cat.name}' with {len(field_defs)} field(s)",
        entity_id=cat.id,
        actor=actor,
    )
    db.commit()
    db.refresh(cat)

    cat_out = map_category(cat, items_count=0)
    return CategoryDetailOut(
        **cat_out.model_dump(),
        fields=[map_field(f) for f in field_defs],
    )
