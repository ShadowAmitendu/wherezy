# HomeInventory API Contract

All endpoints reside under `/api`.
Request bodies and non-binary response bodies are JSON (`Content-Type: application/json`).
All timestamps are ISO-8601 UTC strings (`YYYY-MM-DDTHH:MM:SSZ` or similar).

## 1. Authentication & Session
- Authentication uses a signed HTTP-only cookie named `hi_session`.
- If no PIN is configured (`/api/auth/status` returns `pin_set: false`), the app operates openly.
- If a PIN is configured, API requests requiring authentication will return `401 Unauthorized` unless a valid session cookie is provided.
- Login failures are rate-limited to 5 per minute per client IP (`429 Too Many Requests`).

## 2. Standard Error Format
All errors return the standard error structure:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Form validation failed",
    "fields": {
      "f_a1b2c3d4": "Field 'Generic name' is required"
    }
  }
}
```

Common error codes:
- `NOT_FOUND`: Resource with given ID does not exist.
- `DUPLICATE_NAME`: Category with this name already exists.
- `CATEGORY_HAS_ITEMS`: Cannot delete category with active items (HTTP 409).
- `LOCATION_HAS_CHILDREN`: Cannot delete location with sub-locations (HTTP 409).
- `LOCATION_HAS_ITEMS`: Cannot delete location with items (HTTP 409).
- `CYCLE_DETECTED`: Moving a location into its own subtree is rejected (HTTP 400).
- `INCOMPATIBLE_TYPE_CHANGE`: Field type change is not allowed (HTTP 400).
- `MAX_SHOW_IN_LIST`: Exceeded the 4-field limit for table display (HTTP 400).
- `PHOTO_LIMIT_EXCEEDED`: Exceeded photo limit per item/location (HTTP 400).
- `RATE_LIMITED`: Too many failed PIN attempts (HTTP 429).
- `INVALID_PIN`: Incorrect PIN provided (HTTP 401).

## 3. Pagination Shape
List endpoints (`/api/items`) return:
```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "page_size": 25,
  "total_pages": 2
}
```

## 4. Short Codes & QR URLs
- Item short code: `I{id}` (e.g. `I12`)
- Location short code: `L{id}` (e.g. `L3`)
- QR URL format: `{base_url}/#/i/{id}` or `{base_url}/#/l/{id}`
- Resolving: `GET /api/codes/resolve?code=...` accepts `I12`, `L3`, or full URLs.

## 5. Custom Field Key Format
- Every custom field has an immutable, unique key matching `^f_[a-z0-9]{8}$`.
- Renaming a field modifies `label` while leaving `key` and data unchanged.
- Deleting a field sets `archived = 1`.
- Items store values in `values_json`: `{"f_abc12345": "Amoxicillin", "f_def67890": 500}`.
