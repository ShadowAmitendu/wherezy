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
from backend.app.core.db import engine
from backend.app.core.migrations import run_migrations

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
        conn.execute(text("DELETE FROM photos;"))
        conn.execute(text("DELETE FROM items;"))
        conn.execute(text("DELETE FROM field_defs;"))
        conn.execute(text("DELETE FROM categories;"))
        conn.execute(text("DELETE FROM locations;"))
        conn.execute(text("DELETE FROM settings;"))
        conn.execute(text("PRAGMA foreign_keys = ON;"))
    yield
