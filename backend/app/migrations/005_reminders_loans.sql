-- 005_reminders_loans.sql
PRAGMA foreign_keys = ON;

-- Alter field_defs
ALTER TABLE field_defs ADD COLUMN remind INTEGER NOT NULL DEFAULT 0;
ALTER TABLE field_defs ADD COLUMN remind_lead_days INTEGER NULL;
ALTER TABLE field_defs ADD COLUMN remind_offset_days INTEGER NULL;

-- Alter categories
ALTER TABLE categories ADD COLUMN expiry_lead_days INTEGER NULL;

-- Alter items
ALTER TABLE items ADD COLUMN taken_due TEXT NULL;
ALTER TABLE items ADD COLUMN taken_by_profile_id INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS reminder_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK (source_type IN ('expiry', 'field', 'loan')),
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    field_key TEXT NULL,
    due_date TEXT NOT NULL,
    profile_id INTEGER NULL REFERENCES profiles(id) ON DELETE CASCADE,
    snoozed_until TEXT NULL,
    dismissed_at TEXT NULL,
    UNIQUE(source_type, item_id, field_key, due_date, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_reminder_state_item ON reminder_state(item_id);
CREATE INDEX IF NOT EXISTS idx_reminder_state_profile ON reminder_state(profile_id);
