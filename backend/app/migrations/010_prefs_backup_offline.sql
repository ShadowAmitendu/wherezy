-- 010_prefs_backup_offline.sql
PRAGMA foreign_keys = ON;

ALTER TABLE profiles ADD COLUMN accent_color TEXT NULL;
ALTER TABLE profiles ADD COLUMN language TEXT NULL;
ALTER TABLE profiles ADD COLUMN text_scale INTEGER NOT NULL DEFAULT 100 CHECK (text_scale IN (100, 125, 150));
ALTER TABLE profiles ADD COLUMN high_contrast INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('system', 'light', 'dark'));
ALTER TABLE profiles ADD COLUMN is_display INTEGER NOT NULL DEFAULT 0;
