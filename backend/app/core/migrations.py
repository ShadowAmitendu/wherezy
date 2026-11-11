import sqlite3
import os
import zipfile
import datetime
import tempfile
from pathlib import Path
from backend.app.core.config import DB_PATH, BACKUPS_DIR, PHOTOS_DIR, FILES_DIR, DATA_DIR

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
TARGET_V2_VERSION = 11


class MigrationError(Exception):
    def __init__(self, message: str, backup_path: str = ""):
        super().__init__(message)
        self.message = message
        self.backup_path = backup_path


def _add_dir_to_zip(zf: zipfile.ZipFile, directory: Path, base_dir: Path) -> None:
    if not directory.exists():
        return
    for root, _, files in os.walk(directory):
        for file_name in files:
            full_path = Path(root) / file_name
            rel_path = full_path.relative_to(base_dir)
            zf.write(str(full_path), arcname=rel_path.as_posix())


def _split_sql_statements(sql_script: str) -> list[str]:
    """Split a SQL script into complete statements while preserving transaction control."""
    statements: list[str] = []
    buffer = ""
    for line in sql_script.splitlines(keepends=True):
        stripped = line.strip()
        if not buffer and (not stripped or stripped.startswith("--")):
            continue
        buffer += line
        if sqlite3.complete_statement(buffer):
            stmt = buffer.strip()
            if stmt:
                statements.append(stmt)
            buffer = ""
    if buffer.strip():
        statements.append(buffer.strip())
    return statements


def create_pre_v2_backup(db_path: Path) -> Path:
    """Create a safe pre-v2 backup zip containing the database, photos, and files before migrations run."""
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUPS_DIR / f"pre-v2-{ts}.zip"

    # Safely backup SQLite database using SQLite online backup API
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_db:
        tmp_db_path = Path(tmp_db.name)
    try:
        source_conn = sqlite3.connect(str(db_path))
        dest_conn = sqlite3.connect(str(tmp_db_path))
        try:
            source_conn.backup(dest_conn)
        finally:
            dest_conn.close()
            source_conn.close()

        with zipfile.ZipFile(backup_file, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(tmp_db_path, arcname="inventory.db")
            _add_dir_to_zip(zf, PHOTOS_DIR, DATA_DIR)
            _add_dir_to_zip(zf, FILES_DIR, DATA_DIR)
    finally:
        if tmp_db_path.exists():
            tmp_db_path.unlink(missing_ok=True)

    return backup_file


def run_migrations(db_path: Path = DB_PATH):
    is_existing_db = db_path.exists()
    conn = sqlite3.connect(str(db_path))
    backup_path = ""
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA user_version")
        row = cursor.fetchone()
        current_version = row[0] if row else 0

        # Safety: create pre-v2 backup if upgrading an existing v1 database
        if is_existing_db and 0 < current_version < TARGET_V2_VERSION:
            try:
                b_path = create_pre_v2_backup(db_path)
                backup_path = str(b_path)
            except Exception as e:
                print(f"[WARNING] Pre-v2 backup warning: {e}")

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
                statements = _split_sql_statements(sql_script)
                try:
                    cursor.execute("BEGIN TRANSACTION")
                    for stmt in statements:
                        cursor.execute(stmt)
                    cursor.execute(f"PRAGMA user_version = {version}")
                    conn.commit()
                    current_version = version
                except Exception as exc:
                    conn.rollback()
                    raise MigrationError(
                        f"Migration {file_name} failed: {exc}",
                        backup_path=backup_path
                    ) from exc
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations()
