import os
import shutil
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.config import DATA_DIR
from backend.app.core.db import get_db
from backend.app.models import Setting, Profile
from backend.app.schemas import (
    SecondCopyConfig, SecondCopyStatus, SecondCopyFileOut, SuccessResponse
)
from backend.app.services.permissions import require
from backend.app.services.activity import record

router = APIRouter(prefix="/admin/second-copy", tags=["Second-Copy Backup"])

LOCAL_BACKUPS_DIR = DATA_DIR / "backups"

def _get_setting(db: Session, key: str, default=None):
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row:
        return default
    try:
        return json.loads(row.value_json)
    except Exception:
        return default

def _set_setting(db: Session, key: str, value: any):
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row:
        row = Setting(key=key, value_json=json.dumps(value))
        db.add(row)
    else:
        row.value_json = json.dumps(value)
    db.commit()

@router.get("", response_model=SecondCopyStatus)
def get_second_copy_status(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    enabled = bool(_get_setting(db, "second_copy_enabled", False))
    path_str = _get_setting(db, "second_copy_path")
    keep = int(_get_setting(db, "second_copy_keep", 14))
    last_ok = _get_setting(db, "second_copy_last_ok")
    last_error = _get_setting(db, "second_copy_last_error")
    last_file = _get_setting(db, "second_copy_last_file")

    free_bytes = None
    if path_str:
        p = Path(path_str)
        if p.exists() and p.is_dir():
            try:
                usage = shutil.disk_usage(p)
                free_bytes = usage.free
            except Exception:
                pass

    return SecondCopyStatus(
        enabled=enabled,
        path=path_str,
        keep=keep,
        last_ok=last_ok,
        last_error=last_error,
        last_file=last_file,
        free_space_bytes=free_bytes
    )

@router.put("", response_model=SecondCopyStatus)
def update_second_copy_config(
    payload: SecondCopyConfig,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    if payload.path:
        dest = Path(payload.path).resolve()
        data_res = DATA_DIR.resolve()
        # Refuse a path inside the app's own data directory
        try:
            dest.relative_to(data_res)
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "INVALID_PATH", "message": "Second copy folder cannot be inside the application data folder"}}
            )
        except ValueError:
            pass  # Valid: dest is not inside data_res

    _set_setting(db, "second_copy_enabled", payload.enabled)
    _set_setting(db, "second_copy_path", payload.path)
    _set_setting(db, "second_copy_keep", payload.keep)

    return get_second_copy_status(db, current)

@router.post("/test", response_model=SuccessResponse)
def test_second_copy_folder(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    path_str = _get_setting(db, "second_copy_path")
    if not path_str:
        raise HTTPException(status_code=400, detail={"error": {"code": "NO_PATH", "message": "No second copy folder path configured"}})

    dest = Path(path_str)
    if not dest.exists():
        try:
            dest.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail={"error": {"code": "CANNOT_CREATE", "message": f"Cannot create folder: {str(e)}"}})

    # Write and delete a small test file
    test_file = dest / ".homeinventory_test_write"
    try:
        with open(test_file, "w") as f:
            f.write("OK")
        os.remove(test_file)
        usage = shutil.disk_usage(dest)
        free_gb = round(usage.free / (1024**3), 2)
        return SuccessResponse(ok=True, message=f"Folder is writable. Free space: {free_gb} GB")
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "NOT_WRITABLE", "message": f"Folder is not writable: {str(e)}"}})

@router.post("/run", response_model=SuccessResponse)
def run_second_copy(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    path_str = _get_setting(db, "second_copy_path")
    if not path_str:
        raise HTTPException(status_code=400, detail={"error": {"code": "NO_PATH", "message": "No folder configured"}})

    dest = Path(path_str)
    if not dest.exists():
        raise HTTPException(status_code=400, detail={"error": {"code": "FOLDER_MISSING", "message": "Folder does not exist"}})

    # Find latest local backup zip
    if not LOCAL_BACKUPS_DIR.exists():
        raise HTTPException(status_code=400, detail={"error": {"code": "NO_BACKUPS", "message": "No local backups found"}})

    zips = sorted(LOCAL_BACKUPS_DIR.glob("*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)
    if not zips:
        raise HTTPException(status_code=400, detail={"error": {"code": "NO_BACKUPS", "message": "No local backups found"}})

    src_zip = zips[0]
    zip_size = src_zip.stat().st_size

    # Check free space >= 2x zip size
    usage = shutil.disk_usage(dest)
    if usage.free < zip_size * 2:
        msg = f"Insufficient disk space on backup destination (need {zip_size * 2} bytes, have {usage.free})"
        _set_setting(db, "second_copy_last_error", msg)
        record(db, "system", "second_copy_failed", msg, actor=current)
        db.commit()
        raise HTTPException(status_code=400, detail={"error": {"code": "LOW_SPACE", "message": msg}})

    # Safe write: .part then rename
    part_target = dest / (src_zip.name + ".part")
    final_target = dest / src_zip.name

    try:
        shutil.copy2(src_zip, part_target)

        # Verify SHA-256
        def get_sha256(filepath):
            h = hashlib.sha256()
            with open(filepath, "rb") as f:
                while chunk := f.read(65536):
                    h.update(chunk)
            return h.hexdigest()

        if get_sha256(src_zip) != get_sha256(part_target):
            if part_target.exists():
                os.remove(part_target)
            raise ValueError("SHA-256 checksum mismatch after copy")

        # Atomic rename
        if final_target.exists():
            os.remove(final_target)
        part_target.rename(final_target)

        # Prune older copies matching app pattern
        keep_count = int(_get_setting(db, "second_copy_keep", 14))
        # Matches backup_*.zip or pre-v2-*.zip
        copied_zips = sorted(
            [f for f in dest.glob("*.zip") if f.name.startswith("backup_") or f.name.startswith("pre-v2-")],
            key=lambda f: f.stat().st_mtime,
            reverse=True
        )
        if len(copied_zips) > keep_count:
            for old_f in copied_zips[keep_count:]:
                try:
                    os.remove(old_f)
                except Exception:
                    pass

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        _set_setting(db, "second_copy_last_ok", now_str)
        _set_setting(db, "second_copy_last_file", src_zip.name)
        _set_setting(db, "second_copy_last_error", None)

        record(db, "system", "second_copy_success", f"Copied backup '{src_zip.name}' to second copy", actor=current)
        db.commit()

        return SuccessResponse(ok=True, message=f"Backup '{src_zip.name}' successfully copied to {path_str}")

    except Exception as e:
        if part_target.exists():
            try:
                os.remove(part_target)
            except Exception:
                pass
        err_msg = str(e)
        _set_setting(db, "second_copy_last_error", err_msg)
        record(db, "system", "second_copy_failed", f"Second copy failed: {err_msg}", actor=current)
        db.commit()
        raise HTTPException(status_code=500, detail={"error": {"code": "COPY_FAILED", "message": err_msg}})

@router.get("/files", response_model=List[SecondCopyFileOut])
def list_second_copy_files(
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    path_str = _get_setting(db, "second_copy_path")
    if not path_str:
        return []

    dest = Path(path_str)
    if not dest.exists():
        return []

    files = [f for f in dest.glob("*.zip") if f.name.startswith("backup_") or f.name.startswith("pre-v2-")]
    results = []
    for f in sorted(files, key=lambda x: x.stat().st_mtime, reverse=True):
        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat()
        results.append(SecondCopyFileOut(
            file_name=f.name,
            size_bytes=f.stat().st_size,
            modified_at=mtime
        ))
    return results
