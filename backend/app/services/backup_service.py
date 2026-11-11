import os
import sqlite3
import zipfile
import shutil
from datetime import datetime, timezone
from pathlib import Path
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import close_all_sessions
from backend.app.core.config import DB_PATH, PHOTOS_DIR, FILES_DIR, BACKUPS_DIR, DATA_DIR
from backend.app.core.db import engine
from backend.app.core.migrations import run_migrations

def get_dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for root, _, files in os.walk(path):
        for f in files:
            fp = Path(root) / f
            try:
                total += fp.stat().st_size
            except OSError:
                pass
    return total

def _add_dir_to_zip(zf: zipfile.ZipFile, root_dir: Path) -> None:
    if not root_dir.exists():
        return
    for root, _, files in os.walk(root_dir):
        for f in files:
            full_p = Path(root) / f
            rel_p = full_p.relative_to(DATA_DIR)
            zf.write(str(full_p), arcname=rel_p.as_posix())

def create_backup_archive() -> Path:
    """
    Creates a zip backup containing inventory.db (using SQLite online backup API),
    photos/, and files/. Returns path to created zip in BACKUPS_DIR.
    """
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    zip_filename = f"wherezy_backup_{timestamp}.zip"
    zip_path = BACKUPS_DIR / zip_filename

    # 1. Safely copy SQLite DB using online backup API to a temp file
    temp_db_path = BACKUPS_DIR / f"temp_{timestamp}.db"
    src_conn = sqlite3.connect(str(DB_PATH))
    dst_conn = sqlite3.connect(str(temp_db_path))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    # 2. Package temp DB, photos, and attachment files into ZIP with POSIX arcnames
    with zipfile.ZipFile(str(zip_path), "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(str(temp_db_path), arcname="inventory.db")
        _add_dir_to_zip(zf, PHOTOS_DIR)
        _add_dir_to_zip(zf, FILES_DIR)

    if temp_db_path.exists():
        temp_db_path.unlink()

    return zip_path

def prune_old_backups(keep_count: int = 7):
    backups = sorted(BACKUPS_DIR.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if len(backups) > keep_count:
        for old in backups[keep_count:]:
            try:
                old.unlink()
            except OSError:
                pass

def restore_backup_archive(upload_file: UploadFile) -> str:
    """
    Validates zip, zip-slip bounds, and SQLite integrity, creates a pre-restore backup,
    and restores inventory.db (running migrations), photos/, and files/.
    """
    safety_backup = create_backup_archive()

    temp_zip = BACKUPS_DIR / f"upload_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"
    try:
        with open(temp_zip, "wb") as f:
            shutil.copyfileobj(upload_file.file, f)

        if not zipfile.is_zipfile(temp_zip):
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ZIP", "message": "Uploaded file is not a valid zip archive"}})

        data_root = DATA_DIR.resolve()
        with zipfile.ZipFile(temp_zip, "r") as zf:
            db_info = None
            safe_members = []
            for info in zf.infolist():
                norm = info.filename.replace("\\", "/")
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ZIP", "message": "Archive contains unsupported symlinks"}})
                if info.is_dir() or norm.endswith("/"):
                    continue
                parts = Path(norm).parts
                if norm.startswith("/") or ".." in parts or (len(norm) >= 2 and norm[1] == ":"):
                    raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ZIP", "message": "Archive contains unsafe file paths"}})
                dest_path = (DATA_DIR / norm).resolve()
                if not dest_path.is_relative_to(data_root):
                    raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ZIP", "message": "Archive contains unsafe file paths"}})
                if norm == "inventory.db":
                    db_info = info
                elif norm.startswith("photos/") or norm.startswith("files/"):
                    safe_members.append((info, dest_path))

            if not db_info:
                raise HTTPException(status_code=400, detail={"error": {"code": "CORRUPT_BACKUP", "message": "Backup does not contain inventory.db"}})

            test_db = BACKUPS_DIR / "test_restore.db"
            try:
                if test_db.exists():
                    test_db.unlink()
                with zf.open(db_info, "r") as src, open(test_db, "wb") as dst:
                    shutil.copyfileobj(src, dst)

                conn = sqlite3.connect(str(test_db))
                try:
                    cursor = conn.cursor()
                    cursor.execute("PRAGMA integrity_check")
                    row = cursor.fetchone()
                finally:
                    conn.close()
                if not row or row[0] != "ok":
                    raise HTTPException(status_code=400, detail={"error": {"code": "CORRUPT_DB", "message": "Database failed integrity check"}})

                close_all_sessions()
                engine.dispose()
                for suffix in ("-wal", "-shm"):
                    sidecar = Path(f"{DB_PATH}{suffix}")
                    if sidecar.exists():
                        sidecar.unlink()

                shutil.copyfile(str(test_db), str(DB_PATH))
                run_migrations(DB_PATH)

                for info, dest_path in safe_members:
                    dest_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info, "r") as src, open(dest_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)
            finally:
                if test_db.exists():
                    test_db.unlink()

        return f"Restore successful. Safety backup saved to {safety_backup.name}."
    finally:
        if temp_zip.exists():
            temp_zip.unlink()
