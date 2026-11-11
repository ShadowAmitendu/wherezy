# Wherezy v2 - Architectural Decisions & Baseline

## 1. Baseline Summary
- **v1 Status**: All core functionality operational (Inventory items, category custom form builder, storage location hierarchy, photo attachments, barcode/QR generator & scanner, shelf contents printing, expiry tracking).
- **Test Suite**: 9/9 backend pytest suites passing cleanly.
- **Frontend**: Single-process SPA, Material Design 2 theme, responsive layouts.
- **Data Safety**: Test runner runs in an isolated temporary directory to ensure zero reset of `data/inventory.db`.

## 2. Decision: Inbox Placeholder & Uncategorised Approach (Section 5.14)
- **Problem**: In v1, `category_id` was defined with `NOT NULL REFERENCES categories(id)`. When quick-capturing items to the inbox, the user takes a photo before choosing a category.
- **Decision**: In migration `008_capture_retire_health.sql`, create a system placeholder category:
  - `name = '__inbox_unsorted__'`
  - `icon = 'inbox'`
  - `color = '#757575'`
  - `deleted_at = '1970-01-01T00:00:00Z'` (soft-deleted so it is automatically excluded from all standard user category pickers, lists, and trees).
- When an item is quick-captured to inbox:
  - `status = 'inbox'`
  - `category_id` links to the system inbox category.
  - `name = 'Untitled YYYY-MM-DD HH:MM'` (or user specified).
  - `captured_at = utc_now_iso()`.
- When an item is sorted via `/api/inbox/{id}/sort`:
  - `category_id` is replaced with the user's selected category.
  - `status` flips to `'active'`.
  - Full schema and custom field validation runs at sort time.
- **Benefits**: Zero risk of table rebuild, existing foreign keys and SQLite constraints remain 100% compliant.

## 3. Decision: Role-Based Access Control (RBAC) Architecture
- Roles: `admin`, `member`, `viewer`.
- Enforced on backend via FastAPI dependency `require(permission)`.
- Profiles table stores `role` and optional bcrypt PIN hash.
- Active profile authenticated via signed HttpOnly session cookie (untrusted `X-Profile-ID` headers are ignored).
- Display profiles (`is_display = 1`) are locked to Viewer and restricted to `wall:read` and `GET /profiles/me`.

## 4. Decision: Database Migration Safety (Section 2)
- Safe pre-migration backup created before applying any migration if `user_version < 10`.
- Sequential migrations `002_profiles.sql` to `010_prefs_backup_offline.sql` run in individual transactions.
- PRAGMA `user_version` updated upon successful commit.
