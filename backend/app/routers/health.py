from datetime import datetime, timezone
from fastapi import APIRouter
from backend.app.schemas import HealthResponse

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthResponse)
def get_health():
    return HealthResponse(status="ok", time=datetime.now(timezone.utc).isoformat())
