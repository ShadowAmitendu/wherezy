import sqlite3
import os
import zipfile
import datetime
import tempfile
from pathlib import Path
from backend.app.core.config import (
    APP_VERSION,
    DB_PATH,
    BACKUPS_DIR,
    PHOTOS_DIR,
    FILES_DIR,
    DATA_DIR,
    MIGRATIONS_DIR,
)

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


def get_latest_migration_version(migrations_dir: Path = MIGRATIONS_DIR) -> int:
    """Return the highest numeric SQL migration version bundled with the app."""
    latest = 0
    if not migrations_dir.is_dir():
        return latest
    for file in migrations_dir.glob("*.sql"):
        try:
            version = int(file.name.split("_")[0])
        except ValueError:
            continue
        if version > latest:
            latest = version
    return latest


def _resolve_backup_root(db_path: Path) -> tuple[Path, Path, Path, Path]:
    """Return (backups_dir, data_root, photos_dir, files_dir) appropriate for `db_path`."""
    try:
        same_db = db_path.resolve() == DB_PATH.resolve()
    except OSError:
        same_db = db_path == DB_PATH
    if same_db:
        return BACKUPS_DIR, DATA_DIR, PHOTOS_DIR, FILES_DIR
    parent = db_path.parent
    return parent / "backups", parent, parent / "photos", parent / "files"


def create_pre_upgrade_backup(
    db_path: Path,
    *,
    from_version: int | None = None,
    to_version: int | None = None,
) -> Path:
    """Create a safe backup zip containing database, photos, and files before migrations run."""
    backups_dir, data_root, photos_dir, files_dir = _resolve_backup_root(db_path)
    backups_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    if from_version is not None and to_version is not None:
        backup_name = f"pre-upgrade-v{from_version}-to-v{to_version}-{ts}.zip"
    else:
        backup_name = f"pre-v2-{ts}.zip"
    backup_file = backups_dir / backup_name

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
            _add_dir_to_zip(zf, photos_dir, data_root)
            _add_dir_to_zip(zf, files_dir, data_root)
    finally:
        if tmp_db_path.exists():
            tmp_db_path.unlink(missing_ok=True)

    return backup_file


def create_pre_v2_backup(db_path: Path) -> Path:
    """Backward-compatible wrapper for pre-upgrade database backup."""
    return create_pre_upgrade_backup(db_path)


def _record_schema_meta(cursor: sqlite3.Cursor, schema_version: int) -> None:
    """Persist app/schema version metadata inside SQLite for safe upgrade tracking."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS _wherezy_schema_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            schema_version INTEGER NOT NULL,
            app_version TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cursor.execute(
        """
        INSERT INTO _wherezy_schema_meta (id, schema_version, app_version, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            schema_version = excluded.schema_version,
            app_version = excluded.app_version,
            updated_at = excluded.updated_at
        """,
        (schema_version, APP_VERSION, now_iso),
    )


def run_migrations(db_path: Path = DB_PATH):
    is_existing_db = db_path.exists() and db_path.stat().st_size > 0
    db_path.parent.mkdir(parents=True, exist_ok=True)
    latest_version = get_latest_migration_version(MIGRATIONS_DIR)
    conn = sqlite3.connect(str(db_path))
    backup_path = ""
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA user_version")
        row = cursor.fetchone()
        current_version = row[0] if row else 0

        if latest_version and current_version > latest_version:
            raise MigrationError(
                f"Database schema version v{current_version} is newer than supported by "
                f"Wherezy v{APP_VERSION} (max v{latest_version}). Please upgrade Wherezy."
            )

        # Safety: create a full backup before applying pending migrations to an existing DB
        if is_existing_db and 0 < current_version < max(TARGET_V2_VERSION, latest_version):
            try:
                b_path = create_pre_upgrade_backup(
                    db_path,
                    from_version=current_version,
                    to_version=latest_version,
                )
                backup_path = str(b_path)
            except Exception as e:
                print(f"[WARNING] Pre-upgrade backup warning: {e}")

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
                    current_version = version
                    _record_schema_meta(cursor, current_version)
                    conn.commit()
                except Exception as exc:
                    conn.rollback()
                    raise MigrationError(
                        f"Migration {file_name} failed: {exc}",
                        backup_path=backup_path
                    ) from exc

        _record_schema_meta(cursor, current_version)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations()
