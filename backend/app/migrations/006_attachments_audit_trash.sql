-- 006_attachments_audit_trash.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    uploaded_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_item ON attachments(item_id);

CREATE TABLE IF NOT EXISTS audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    started_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NULL,
    include_sub INTEGER NOT NULL DEFAULT 1,
    expected_json TEXT NOT NULL,
    found_json TEXT NOT NULL,
    summary_json TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_audits_location ON audits(location_id, started_at DESC);

-- Add deleted_by to items, locations, categories for trash tracking
ALTER TABLE items ADD COLUMN deleted_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE locations ADD COLUMN deleted_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN deleted_by INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL;
