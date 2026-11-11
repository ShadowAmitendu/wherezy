import re
import uuid
import mimetypes
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.app.core.config import FILES_DIR
from backend.app.core.db import get_db
from backend.app.models import Attachment, Item, Profile
from backend.app.schemas import AttachmentOut, AttachmentRenameRequest, SuccessResponse
from backend.app.services.permissions import require
from backend.app.services.activity import record

router = APIRouter(tags=["Attachments"])

MAX_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_MIMES = {
    "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif",
    "text/plain", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

def _safe_disposition(file_name: str, is_inline: bool) -> str:
    clean = re.sub(r'[\x00-\x1f\x7f"\\]', "_", Path(file_name or "attachment").name).strip() or "attachment"
    ascii_fallback = clean.encode("ascii", "ignore").decode("ascii").strip() or "attachment"
    disp_type = "inline" if is_inline else "attachment"
    return f'{disp_type}; filename="{ascii_fallback}"; filename*=UTF-8\'\'{quote(clean)}'

@router.post("/items/{item_id}/attachments", response_model=AttachmentOut)
async def upload_attachment(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("attachments:write"))
):
    item = db.query(Item).filter(Item.id == item_id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    # Check count limit (10 per item)
    count = db.query(Attachment).filter(Attachment.item_id == item.id).count()
    if count >= 10:
        raise HTTPException(status_code=400, detail={"error": {"code": "LIMIT_EXCEEDED", "message": "Maximum 10 attachments per item"}})

    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail={"error": {"code": "FILE_TOO_LARGE", "message": "File exceeds 25 MB limit"}})

    orig_name = Path(file.filename or "attachment").name or "attachment"
    # Content type detection
    mime = file.content_type or mimetypes.guess_type(orig_name)[0] or "application/octet-stream"
    if mime not in ALLOWED_MIMES and not mime.startswith("image/"):
        raise HTTPException(status_code=400, detail={"error": {"code": "UNSUPPORTED_TYPE", "message": f"Unsupported file type '{mime}'"}})

    item_dir = FILES_DIR / str(item_id)
    item_dir.mkdir(parents=True, exist_ok=True)

    random_id = str(uuid.uuid4())
    ext = Path(orig_name).suffix[:16]
    stored_name = f"{random_id}{ext}"
    target_path = item_dir / stored_name

    with open(target_path, "wb") as f:
        f.write(content)

    att = Attachment(
        item_id=item.id,
        file_name=orig_name,
        stored_name=stored_name,
        mime=mime,
        bytes=len(content),
        uploaded_by=current.id
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    record(db, "attachment", "created", f"Added attachment '{att.file_name}' to '{item.name}'", entity_id=att.id, actor=current)
    db.commit()

    return AttachmentOut(
        id=att.id,
        item_id=att.item_id,
        file_name=att.file_name,
        mime=att.mime,
        bytes=att.bytes,
        uploaded_by=att.uploaded_by,
        created_at=att.created_at
    )

@router.get("/attachments/{attachment_id}/file")
def get_attachment_file(
    attachment_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("attachments:read"))
):
    att = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Attachment not found"}})

    item = db.query(Item).filter(Item.id == att.item_id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    file_path = (FILES_DIR / str(att.item_id) / Path(att.stored_name).name).resolve()
    if not file_path.is_relative_to(FILES_DIR.resolve()) or not file_path.exists():
        raise HTTPException(status_code=404, detail={"error": {"code": "FILE_NOT_FOUND", "message": "File missing on disk"}})

    is_inline = att.mime in ("application/pdf",) or att.mime.startswith("image/")
    disposition = _safe_disposition(att.file_name, is_inline=is_inline)

    return FileResponse(
        path=str(file_path),
        media_type=att.mime,
        headers={"Content-Disposition": disposition}
    )

@router.put("/attachments/{attachment_id}", response_model=AttachmentOut)
def rename_attachment(
    attachment_id: int,
    payload: AttachmentRenameRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("attachments:write"))
):
    att = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Attachment not found"}})

    item = db.query(Item).filter(Item.id == att.item_id, Item.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Item not found"}})

    att.file_name = payload.file_name.strip()
    db.commit()
    db.refresh(att)

    return AttachmentOut(
        id=att.id,
        item_id=att.item_id,
        file_name=att.file_name,
        mime=att.mime,
        bytes=att.bytes,
        uploaded_by=att.uploaded_by,
        created_at=att.created_at
    )

@router.delete("/attachments/{attachment_id}", response_model=SuccessResponse)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("attachments:write"))
):
    att = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Attachment not found"}})

    file_path = (FILES_DIR / str(att.item_id) / Path(att.stored_name).name).resolve()
    if file_path.is_relative_to(FILES_DIR.resolve()) and file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass

    name = att.file_name
    item_id = att.item_id
    db.delete(att)
    db.commit()

    record(db, "attachment", "deleted", f"Deleted attachment '{name}'", entity_id=attachment_id, actor=current)
    db.commit()

    return SuccessResponse(ok=True, message=f"Attachment '{name}' deleted")
