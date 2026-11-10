import os
import io
import sqlite3
import zipfile
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple
from fastapi import HTTPException, UploadFile, status
from backend.app.core.config import DB_PATH, PHOTOS_DIR, BACKUPS_DIR, DATA_DIR
from backend.app.schemas import BackupFileOut, StorageStatsResponse

def get_dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for root, _, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except Exception:
                pass
    return total

def create_backup_archive() -> Path:
    """
    Creates a zip backup containing inventory.db (using SQLite online backup API) and photos/.
    Returns path to created zip in BACKUPS_DIR.
    """
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    zip_filename = f"homeinventory_backup_{timestamp}.zip"
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

    # 2. Package temp DB and photos into ZIP
    with zipfile.ZipFile(str(zip_path), "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(str(temp_db_path), arcname="inventory.db")
        if PHOTOS_DIR.exists():
            for root, _, files in os.walk(PHOTOS_DIR):
                for f in files:
                    full_p = Path(root) / f
                    rel_p = full_p.relative_to(DATA_DIR)
                    zf.write(str(full_p), arcname=str(rel_p))

    # Clean up temp db
    if temp_db_path.exists():
        temp_db_path.unlink()

    return zip_path

def prune_old_backups(keep_count: int = 7):
    backups = sorted(BACKUPS_DIR.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if len(backups) > keep_count:
        for old in backups[keep_count:]:
            try:
                old.unlink()
            except Exception:
                pass

def restore_backup_archive(upload_file: UploadFile) -> str:
    """
    Validates zip and schema, creates pre-restore backup, and restores db & photos.
    """
    # Create safety pre-restore backup first
    safety_backup = create_backup_archive()

    temp_zip = BACKUPS_DIR / f"upload_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"
    try:
        with open(temp_zip, "wb") as f:
            shutil.copyfileobj(upload_file.file, f)

        # Validate zip
        if not zipfile.is_zipfile(temp_zip):
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ZIP", "message": "Uploaded file is not a valid zip archive"}})

        with zipfile.ZipFile(temp_zip, "r") as zf:
            namelist = zf.namelist()
            if "inventory.db" not in namelist:
                raise HTTPException(status_code=400, detail={"error": {"code": "CORRUPT_BACKUP", "message": "Backup does not contain inventory.db"}})

            # Extract test DB to verify integrity
            test_db = BACKUPS_DIR / "test_restore.db"
            try:
                zf.extract("inventory.db", path=str(BACKUPS_DIR))
                extracted_db = BACKUPS_DIR / "inventory.db"
                if test_db.exists():
                    test_db.unlink()
                extracted_db.rename(test_db)

                # Check SQLite integrity
                conn = sqlite3.connect(str(test_db))
                cursor = conn.cursor()
                cursor.execute("PRAGMA integrity_check")
                row = cursor.fetchone()
                conn.close()
                if not row or row[0] != "ok":
                    raise HTTPException(status_code=400, detail={"error": {"code": "CORRUPT_DB", "message": "Database failed integrity check"}})

                # If test passed, replace main database
                shutil.copyfile(str(test_db), str(DB_PATH))

                # Extract photos
                for member in namelist:
                    if member.startswith("photos/") and not member.endswith("/"):
                        zf.extract(member, path=str(DATA_DIR))

            finally:
                if test_db.exists():
                    test_db.unlink()
                extracted_db = BACKUPS_DIR / "inventory.db"
                if extracted_db.exists():
                    extracted_db.unlink()

        return f"Restore successful. Safety backup saved to {safety_backup.name}."
    finally:
        if temp_zip.exists():
            temp_zip.unlink()
