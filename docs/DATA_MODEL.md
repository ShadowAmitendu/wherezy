# Wherezy Data Model

All timestamps are ISO-8601 UTC strings (`YYYY-MM-DDTHH:MM:SSZ`).
Primary keys are auto-incrementing integers.
Soft-delete is used on `categories`, `locations`, and `items` via `deleted_at IS NOT NULL`.

## Tables

### `categories`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL UNIQUE
- `icon` TEXT NOT NULL DEFAULT 'category'
- `color` TEXT NOT NULL DEFAULT '#1976d2'
- `track_expiry` INTEGER NOT NULL DEFAULT 0 (boolean 0/1)
- `expiry_label` TEXT NULL DEFAULT 'Expiry date'
- `sort_order` INTEGER NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT NULL

### `field_defs`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `category_id` INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE
- `key` TEXT NOT NULL (e.g. `f_a1b2c3`, stable identifier regex `^f_[a-z0-9]{6,}$`)
- `label` TEXT NOT NULL
- `type` TEXT NOT NULL CHECK (type IN ('text', 'longtext', 'number', 'date', 'dropdown', 'multiselect', 'checkbox'))
- `required` INTEGER NOT NULL DEFAULT 0 (boolean 0/1)
- `options_json` TEXT NULL (JSON array of strings for dropdown/multiselect)
- `unit` TEXT NULL (e.g. 'W', 'lm', 'V')
- `hint` TEXT NULL
- `sort_order` INTEGER NOT NULL DEFAULT 0
- `show_in_list` INTEGER NOT NULL DEFAULT 0 (boolean 0/1, max 4 per category)
- `archived` INTEGER NOT NULL DEFAULT 0 (boolean 0/1)
- UNIQUE(`category_id`, `key`)

### `locations`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `parent_id` INTEGER NULL REFERENCES locations(id) ON DELETE RESTRICT
- `name` TEXT NOT NULL
- `kind` TEXT NOT NULL DEFAULT 'Room' (free text: Room, Cupboard, Shelf, Drawer, Box, Bag, etc.)
- `notes` TEXT NULL
- `sort_order` INTEGER NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT NULL

### `items`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `category_id` INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT
- `name` TEXT NOT NULL
- `location_id` INTEGER NULL REFERENCES locations(id) ON DELETE RESTRICT
- `quantity` INTEGER NOT NULL DEFAULT 1 (total units stored, >= 1)
- `taken_out` INTEGER NOT NULL DEFAULT 0 (boolean 0/1, synchronized with `taken_out_quantity > 0`)
- `taken_out_quantity` INTEGER NOT NULL DEFAULT 0 (number of units currently taken out, `0 .. quantity`)
- `taken_by` TEXT NULL
- `taken_at` TEXT NULL
- `expiry_date` TEXT NULL (YYYY-MM-DD, built-in, indexed)
- `notes` TEXT NULL
- `values_json` TEXT NOT NULL DEFAULT '{}' (custom field values keyed by `field_def.key`)
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT NULL

### `photos`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `owner_type` TEXT NOT NULL CHECK (owner_type IN ('item', 'location'))
- `owner_id` INTEGER NOT NULL
- `file_name` TEXT NOT NULL
- `thumb_name` TEXT NOT NULL
- `width` INTEGER NOT NULL DEFAULT 0
- `height` INTEGER NOT NULL DEFAULT 0
- `bytes` INTEGER NOT NULL DEFAULT 0
- `is_cover` INTEGER NOT NULL DEFAULT 0 (boolean 0/1)
- `sort_order` INTEGER NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL

### `settings`
- `key` TEXT PRIMARY KEY
- `value_json` TEXT NOT NULL (JSON string representing scalar or object)

Defaults:
- `pin_hash`: null
- `base_url`: null
- `expiry_warn_days`: 30
- `label_preset`: 'medium'
- `print_defaults`: '{"include_sub":true,"show_photos":true,"show_audit_box":true,"font_size":"medium"}'
- `theme`: 'system'
- `backup_keep`: 7
- `photo_limit_per_owner`: 10

## Indexes
- `CREATE INDEX idx_items_category_id ON items(category_id);`
- `CREATE INDEX idx_items_location_id ON items(location_id);`
- `CREATE INDEX idx_items_expiry_date ON items(expiry_date);`
- `CREATE INDEX idx_items_taken_out ON items(taken_out);`
- `CREATE INDEX idx_photos_owner ON photos(owner_type, owner_id);`
- `CREATE INDEX idx_locations_parent_id ON locations(parent_id);`
