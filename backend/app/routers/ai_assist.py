"""Router for AI-assisted item extraction, inbox photo sorting, bulk item import, and location hierarchy setup."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.models import Profile
from backend.app.schemas import (
    AiBulkCommitRequest,
    AiBulkCommitResponse,
    AiBulkExtractResponse,
    AiConnectionTestRequest,
    AiConnectionTestResponse,
    AiItemExtractResponse,
    AiLocalModelsRequest,
    AiLocalModelsResponse,
    AiLocationCommitRequest,
    AiLocationCommitResponse,
    AiLocationGenerateResponse,
)
from backend.app.services.ai_inventory_service import (
    analyze_inbox_item,
    commit_bulk_ai_items,
    commit_location_hierarchy,
    extract_bulk_items_plan,
    extract_item_plan,
    generate_location_hierarchy_plan,
)
from backend.app.services.gemini_shared import (
    fetch_local_models,
    read_uploaded_audio,
    read_uploaded_image,
    test_ai_connection,
)
from backend.app.services.permissions import require

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


@router.post("/item/extract", response_model=AiItemExtractResponse)
def extract_single_item_with_ai(
    prompt: Optional[str] = Form(default=None),
    preferred_category_id: Optional[int] = Form(default=None),
    preferred_location_id: Optional[int] = Form(default=None),
    audio: Optional[UploadFile] = File(default=None),
    image: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("items:write")),
):
    """Extract structured item fields (name, category, location, qty, expiry, notes, custom fields) from voice, photo, or text."""
    audio_bytes, audio_mime = read_uploaded_audio(audio)
    image_bytes, image_mime = read_uploaded_image(image)
    suggestion = extract_item_plan(
        db,
        prompt_text=prompt,
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime,
        image_bytes=image_bytes,
        image_mime_type=image_mime,
        preferred_category_id=preferred_category_id,
        preferred_location_id=preferred_location_id,
    )
    return AiItemExtractResponse(suggestion=suggestion)


@router.post("/inbox/{item_id}/analyze", response_model=AiItemExtractResponse)
def analyze_inbox_item_with_ai(
    item_id: int,
    prompt: Optional[str] = Form(default=None),
    audio: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("inbox:write")),
):
    """Analyze a quick-capture inbox item's saved photo (and optional voice/prompt) to auto-suggest sorting details."""
    audio_bytes, audio_mime = read_uploaded_audio(audio)
    suggestion = analyze_inbox_item(
        db,
        item_id,
        prompt_text=prompt,
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime,
    )
    return AiItemExtractResponse(suggestion=suggestion)


@router.post("/items/bulk-extract", response_model=AiBulkExtractResponse)
def bulk_extract_items_with_ai(
    prompt: Optional[str] = Form(default=None),
    preferred_category_id: Optional[int] = Form(default=None),
    preferred_location_id: Optional[int] = Form(default=None),
    lock_category: bool = Form(default=False),
    audio: Optional[UploadFile] = File(default=None),
    image: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("bulk:write")),
):
    """Extract multiple distinct items with quantities, expiry dates, and attributes from voice, photo/receipt, or text."""
    audio_bytes, audio_mime = read_uploaded_audio(audio)
    image_bytes, image_mime = read_uploaded_image(image)
    return extract_bulk_items_plan(
        db,
        prompt_text=prompt,
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime,
        image_bytes=image_bytes,
        image_mime_type=image_mime,
        preferred_category_id=preferred_category_id,
        preferred_location_id=preferred_location_id,
        lock_category=bool(lock_category),
    )


@router.post("/items/bulk-commit", response_model=AiBulkCommitResponse)
def commit_bulk_ai_items_endpoint(
    payload: AiBulkCommitRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("bulk:write")),
):
    """Atomically persist reviewed AI-extracted items across categories and locations."""
    return commit_bulk_ai_items(db, payload, actor=current)


@router.post("/locations/generate", response_model=AiLocationGenerateResponse)
def generate_locations_with_ai(
    prompt: Optional[str] = Form(default=None),
    root_parent_id: Optional[int] = Form(default=None),
    create: bool = Form(default=False),
    audio: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:write")),
):
    """Generate a structured room/cupboard/shelf/box hierarchy from voice or prompt text."""
    audio_bytes, audio_mime = read_uploaded_audio(audio)
    plan = generate_location_hierarchy_plan(
        db,
        prompt_text=prompt,
        audio_bytes=audio_bytes,
        audio_mime_type=audio_mime,
        root_parent_id=root_parent_id,
    )
    created_locs = []
    if create and plan.nodes:
        committed = commit_location_hierarchy(
            db,
            AiLocationCommitRequest(root_parent_id=root_parent_id, nodes=plan.nodes),
            actor=current,
        )
        created_locs = committed.locations

    return AiLocationGenerateResponse(
        created=bool(create and created_locs),
        plan=plan,
        created_locations=created_locs,
    )


@router.post("/locations/commit", response_model=AiLocationCommitResponse)
def commit_locations_with_ai(
    payload: AiLocationCommitRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("locations:write")),
):
    """Persist an approved AI-generated location hierarchy atomically."""
    return commit_location_hierarchy(db, payload, actor=current)


@router.post("/config/models", response_model=AiLocalModelsResponse)
def list_local_ai_models(
    payload: AiLocalModelsRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:settings")),
):
    """Discover available models from a Local LLM / OpenAI-compatible server."""
    resolved_url, models = fetch_local_models(
        db,
        base_url=payload.base_url,
        api_key=payload.api_key,
    )
    return AiLocalModelsResponse(ok=True, base_url=resolved_url, models=models)


@router.post("/config/test", response_model=AiConnectionTestResponse)
def test_ai_provider_connection(
    payload: AiConnectionTestRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin:settings")),
):
    """Verify connectivity and JSON output with the configured or pending AI provider."""
    result = test_ai_connection(
        db,
        provider=payload.provider,
        gemini_api_key=payload.gemini_api_key,
        gemini_model=payload.gemini_model,
        local_llm_base_url=payload.local_llm_base_url,
        local_llm_model=payload.local_llm_model,
        local_llm_api_key=payload.local_llm_api_key,
    )
    return AiConnectionTestResponse(**result)
