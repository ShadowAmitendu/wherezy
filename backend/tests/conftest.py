import os
import tempfile
import shutil
from pathlib import Path

# Configure isolated temporary data directory for all tests so live data/inventory.db is NEVER touched
TEST_DATA_DIR = Path(tempfile.gettempdir()) / "homeinventory_test_data"
TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["DATA_DIR"] = str(TEST_DATA_DIR)

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient
from backend.app.core.db import engine, SessionLocal
from backend.app.core.migrations import run_migrations
from backend.app.main import app

@pytest.fixture(scope="session", autouse=True)
def init_db():
    run_migrations()
    yield
    try:
        shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
    except Exception:
        pass

@pytest.fixture(autouse=True)
def clean_tables():
    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF;"))
        conn.execute(text("DELETE FROM box_items;"))
        conn.execute(text("DELETE FROM boxes;"))
        conn.execute(text("DELETE FROM moves;"))
        conn.execute(text("DELETE FROM label_templates;"))
        conn.execute(text("DELETE FROM contacts;"))
        conn.execute(text("DELETE FROM health_ignores;"))
        conn.execute(text("DELETE FROM saved_filters;"))
        conn.execute(text("DELETE FROM audits;"))
        conn.execute(text("DELETE FROM attachments;"))
        conn.execute(text("DELETE FROM reminder_state;"))
        conn.execute(text("DELETE FROM item_tags;"))
        conn.execute(text("DELETE FROM tags;"))
        conn.execute(text("DELETE FROM activity;"))
        conn.execute(text("DELETE FROM photos;"))
        conn.execute(text("DELETE FROM items;"))
        conn.execute(text("DELETE FROM field_defs;"))
        conn.execute(text("DELETE FROM categories;"))
        conn.execute(text("DELETE FROM locations;"))
        conn.execute(text("DELETE FROM settings;"))
        conn.execute(text("DELETE FROM profiles;"))
        # Re-seed Admin profile if needed
        conn.execute(text("INSERT INTO profiles(id, name, color, avatar_emoji, role, is_active, text_scale, high_contrast, theme_mode, is_display, created_at, updated_at) VALUES(1, 'Admin', '#1976d2', '👑', 'admin', 1, 100, 0, 'system', 0, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z');"))
        conn.execute(text("PRAGMA foreign_keys = ON;"))
    yield

@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def client():
    return TestClient(app)
