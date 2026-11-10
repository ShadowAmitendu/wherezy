-- 003_activity.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor_id INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL,
    batch_id TEXT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN (
        'item', 'location', 'category', 'field', 'tag', 'photo', 'attachment',
        'profile', 'settings', 'audit', 'system', 'contact', 'label', 'move', 'box'
    )),
    entity_id INTEGER NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    diff_json TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity(entity_type, entity_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity(actor_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_batch ON activity(batch_id);
