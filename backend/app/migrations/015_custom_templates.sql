-- 015_custom_templates.sql
-- User-created custom category and form templates with editable field types.
CREATE TABLE IF NOT EXISTS custom_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    icon TEXT NOT NULL DEFAULT 'category',
    color TEXT NOT NULL DEFAULT '#1976d2',
    track_expiry INTEGER NOT NULL DEFAULT 0,
    expiry_label TEXT NOT NULL DEFAULT 'Expiry date',
    fields_json TEXT NOT NULL DEFAULT '[]',
    created_by_id INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_templates_slug ON custom_templates(slug);
