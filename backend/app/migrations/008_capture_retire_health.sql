-- 008_capture_retire_health.sql
PRAGMA foreign_keys = ON;

ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inbox', 'retired'));
ALTER TABLE items ADD COLUMN retired_reason TEXT NULL
    CHECK (retired_reason IS NULL OR retired_reason IN ('sold', 'donated', 'thrown_away', 'broken'));
ALTER TABLE items ADD COLUMN retired_on TEXT NULL;
ALTER TABLE items ADD COLUMN retired_note TEXT NULL;
ALTER TABLE items ADD COLUMN retired_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN captured_at TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_items_status_del ON items(status, deleted_at);

CREATE TABLE IF NOT EXISTS health_ignores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_key TEXT NOT NULL CHECK (check_key IN ('no_location', 'no_photo', 'long_expired', 'duplicate', 'stale_inbox')),
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    other_item_id INTEGER NULL REFERENCES items(id) ON DELETE CASCADE,
    ignored_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    UNIQUE(check_key, item_id, other_item_id)
);

CREATE INDEX IF NOT EXISTS idx_health_ignores_check ON health_ignores(check_key, item_id);

-- System placeholder category for inbox items (hidden from user views by soft-delete)
INSERT OR IGNORE INTO categories (name, icon, color, track_expiry, expiry_label, sort_order, created_at, updated_at, deleted_at)
VALUES ('__inbox_unsorted__', 'inbox', '#757575', 0, 'Expiry date', 9999, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), '1970-01-01T00:00:00Z');
