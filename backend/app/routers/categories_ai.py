from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.models import Profile
from backend.app.schemas import (
    AiCategoryCommitRequest,
    AiCategoryGenerateResponse,
    CategoryDetailOut,
)
from backend.app.services.ai_category_service import (
    MAX_AUDIO_BYTES,
    create_category_from_plan,
    generate_ai_category_plan,
    normalize_audio_mime_type,
    sanitize_commit_request,
)
from backend.app.services.permissions import require

router = APIRouter(prefix="/categories/ai", tags=["AI Categories"])


@router.post("/generate", response_model=AiCategoryGenerateResponse)
def generate_category_with_ai(
    prompt: Optional[str] = Form(default=None),
    create: bool = Form(default=True),
    audio: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:write")),
):
    """Optimize a text prompt and/or voice message into a category and optionally persist it."""
    audio_bytes: Optional[bytes] = None
    audio_mime: Optional[str] = None

    if audio is not None:
        raw_bytes = audio.file.read(MAX_AUDIO_BYTES + 1)
        if len(raw_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "AUDIO_TOO_LARGE",
                        "message": "Voice message is too large (maximum 15 MB). Please keep recordings brief.",
                    }
                },
            )
        if raw_bytes:
            audio_bytes = raw_bytes
            audio_mime = normalize_audio_mime_type(audio.content_type, audio.filename)

    plan = generate_ai_category_plan(
        db=db,
        prompt_text=prompt,
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime,
    )

    created_category: Optional[CategoryDetailOut] = None
    if create:
        created_category = create_category_from_plan(db=db, plan=plan, actor=current)

    return AiCategoryGenerateResponse(
        created=bool(create),
        plan=plan,
        category=created_category,
    )


@router.post("/commit", response_model=CategoryDetailOut)
def commit_ai_category(
    payload: AiCategoryCommitRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("categories:write")),
):
    """Persist a previewed and optionally user-edited AI category plan atomically."""
    if not payload.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_NAME", "message": "Category name is required"}},
        )
    plan = sanitize_commit_request(payload)
    return create_category_from_plan(db=db, plan=plan, actor=current)
