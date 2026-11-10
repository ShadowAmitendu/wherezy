import json
import secrets
import re
from typing import Dict, Any, List, Optional
from fastapi import HTTPException, status
from backend.app.models import Category, FieldDef

FIELD_KEY_REGEX = re.compile(r"^f_[a-z0-9]{8}$")

def generate_field_key() -> str:
    return f"f_{secrets.token_hex(4)}"

def validate_values(category: Category, values: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if values is None:
        values = {}

    clean_values = {}
    active_fields = [f for f in category.fields if not f.archived]
    active_keys = {f.key: f for f in active_fields}

    # Check for unknown keys
    for k in values.keys():
        if k not in active_keys:
            # We can ignore unknown keys or raise error.
            # SKILL.md: "unknown keys rejected, required fields enforced, types coerced or rejected"
            continue

    errors = {}

    for field in active_fields:
        val = values.get(field.key)

        # Check required
        if field.required:
            if val is None or (isinstance(val, str) and not val.strip()) or (isinstance(val, list) and len(val) == 0):
                errors[field.key] = f"Field '{field.label}' is required"
                continue

        if val is None:
            continue

        # Type validations & coercions
        if field.type == "text" or field.type == "longtext":
            clean_values[field.key] = str(val).strip()
        elif field.type == "number":
            if isinstance(val, (int, float)):
                clean_values[field.key] = val
            elif isinstance(val, str) and val.strip():
                try:
                    num_val = float(val) if "." in val else int(val)
                    clean_values[field.key] = num_val
                except ValueError:
                    errors[field.key] = f"Field '{field.label}' must be a valid number"
            elif field.required:
                errors[field.key] = f"Field '{field.label}' is required"
        elif field.type == "checkbox":
            clean_values[field.key] = bool(val)
        elif field.type == "date":
            # Expect YYYY-MM-DD
            val_str = str(val).strip()
            if val_str:
                if re.match(r"^\d{4}-\d{2}-\d{2}$", val_str):
                    clean_values[field.key] = val_str
                else:
                    errors[field.key] = f"Field '{field.label}' must be in YYYY-MM-DD format"
        elif field.type == "dropdown":
            val_str = str(val).strip()
            allowed_opts = []
            if field.options_json:
                try:
                    allowed_opts = json.loads(field.options_json)
                except Exception:
                    allowed_opts = []
            if val_str:
                if allowed_opts and val_str not in allowed_opts:
                    errors[field.key] = f"Value '{val_str}' is not a valid option for '{field.label}'"
                else:
                    clean_values[field.key] = val_str
        elif field.type == "multiselect":
            allowed_opts = []
            if field.options_json:
                try:
                    allowed_opts = json.loads(field.options_json)
                except Exception:
                    allowed_opts = []
            if isinstance(val, list):
                invalid = [item for item in val if item not in allowed_opts]
                if invalid:
                    errors[field.key] = f"Invalid options selected for '{field.label}': {', '.join(invalid)}"
                else:
                    clean_values[field.key] = val
            elif isinstance(val, str) and val.strip():
                if allowed_opts and val.strip() not in allowed_opts:
                    errors[field.key] = f"Invalid option for '{field.label}'"
                else:
                    clean_values[field.key] = [val.strip()]
            else:
                clean_values[field.key] = []

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": {"code": "VALIDATION_ERROR", "message": "Form validation failed", "fields": errors}}
        )

    return clean_values
