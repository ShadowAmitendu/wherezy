import sqlite3
import os
from pathlib import Path
from backend.app.core.config import DB_PATH

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

def run_migrations(db_path: Path = DB_PATH):
    conn = sqlite3.connect(str(db_path))
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA user_version")
        row = cursor.fetchone()
        current_version = row[0] if row else 0

        migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        for file in migration_files:
            file_name = file.name
            try:
                version = int(file_name.split("_")[0])
            except ValueError:
                continue

            if version > current_version:
                with open(file, "r", encoding="utf-8") as f:
                    sql_script = f.read()
                cursor.executescript(sql_script)
                cursor.execute(f"PRAGMA user_version = {version}")
                conn.commit()
                current_version = version
    finally:
        conn.close()

if __name__ == "__main__":
    run_migrations()
