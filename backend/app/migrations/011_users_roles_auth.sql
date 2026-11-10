-- 011_users_roles_auth.sql
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS profiles_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    username TEXT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#1976d2',
    avatar_emoji TEXT NOT NULL DEFAULT '👤',
    role TEXT NOT NULL CHECK (role IN ('admin', 'co_admin', 'member', 'viewer', 'custom')),
    pin_hash TEXT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    custom_permissions_json TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    accent_color TEXT NULL,
    language TEXT NULL,
    text_scale INTEGER NOT NULL DEFAULT 100,
    high_contrast INTEGER NOT NULL DEFAULT 0,
    theme_mode TEXT NOT NULL DEFAULT 'system',
    is_display INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO profiles_new (
    id, name, username, color, avatar_emoji, role, pin_hash,
    must_change_password, custom_permissions_json, is_active,
    accent_color, language, text_scale, high_contrast, theme_mode, is_display,
    created_at, updated_at
)
SELECT 
    id, name, 
    CASE WHEN role = 'admin' THEN 'admin' ELSE lower(replace(name, ' ', '')) END, 
    color, avatar_emoji, role, pin_hash, 
    CASE WHEN role = 'admin' THEN 1 ELSE 0 END,
    NULL, is_active, 
    accent_color, language, text_scale, high_contrast, theme_mode, is_display, 
    created_at, updated_at
FROM profiles;

-- Set default admin credentials (admin / admin) with must_change_password = 1
UPDATE profiles_new
SET pin_hash = '$2b$12$2VvlYXnteyaa.lFZCAB52eKhX3GuwAtTgSz37ApHrV.Tzq5jflqZO',
    must_change_password = 1,
    username = 'admin'
WHERE role = 'admin';

DROP TABLE profiles;
ALTER TABLE profiles_new RENAME TO profiles;

-- Clear legacy master PIN settings so user accounts are the sole authority
DELETE FROM settings WHERE key = 'pin_hash' OR key = 'household_pin_required';

PRAGMA foreign_keys = ON;
