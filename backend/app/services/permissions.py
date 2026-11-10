import json
from typing import Optional, Callable
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.core.security import verify_session_token
from backend.app.models import Profile, Setting

ROLE_LEVELS = {
    "admin": 3,
    "member": 2,
    "viewer": 1,
}

PERMISSIONS = {
    # Viewer actions:
    "items:read": ["viewer", "member", "admin"],
    "locations:read": ["viewer", "member", "admin"],
    "categories:read": ["viewer", "member", "admin"],
    "activity:read": ["viewer", "member", "admin"],
    "reminders:read": ["viewer", "member", "admin"],
    "attachments:read": ["viewer", "member", "admin"],
    "audit:read": ["viewer", "member", "admin"],
    "trash:read": ["viewer", "member", "admin"],
    "health:read": ["viewer", "member", "admin"],
    "contacts:read": ["viewer", "member", "admin"],
    "labels:read": ["viewer", "member", "admin"],
    "wall:read": ["viewer", "member", "admin"],
    "offline:read": ["viewer", "member", "admin"],
    "prefs:write_own": ["viewer", "member", "admin"],
    "search:read": ["viewer", "member", "admin"],

    # Member actions:
    "items:write": ["member", "admin"],
    "items:delete": ["member", "admin"],
    "photos:write": ["member", "admin"],
    "attachments:write": ["member", "admin"],
    "tags:write": ["member", "admin"],
    "bulk:write": ["member", "admin"],
    "audit:write": ["member", "admin"],
    "trash:restore": ["member", "admin"],
    "inbox:write": ["member", "admin"],
    "lifecycle:write": ["member", "admin"],
    "health:write": ["member", "admin"],
    "contacts:write": ["member", "admin"],
    "moves:write": ["member", "admin"],
    "labels:write_own": ["member", "admin"],
    "activity:revert": ["member", "admin"],
    "reminders:write": ["member", "admin"],

    # Admin actions:
    "categories:write": ["admin"],
    "locations:write": ["admin"],
    "templates:write": ["admin"],
    "trash:purge": ["admin"],
    "profiles:write": ["admin"],
    "admin:settings": ["admin"],
    "admin:backup": ["admin"],
    "admin:export": ["admin"],
    "admin:import": ["admin"],
    "contacts:delete": ["admin"],
    "labels:write_all": ["admin"],
    "admin:book": ["admin"],
    "prefs:write_all": ["admin"],
    "admin:second_copy": ["admin"],
    "admin:webhook": ["admin"],
}

def get_current_profile(request: Request, db: Session = Depends(get_db)) -> Optional[Profile]:
    # 1. Test header override
    header_profile_id = request.headers.get("X-Profile-ID")
    if header_profile_id:
        try:
            pid = int(header_profile_id)
            prof = db.query(Profile).filter(Profile.id == pid, Profile.is_active == 1).first()
            if prof:
                return prof
        except ValueError:
            pass

    # 2. Extract token from Cookie or Authorization header
    token = request.cookies.get("hi_session") or request.cookies.get("session")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if not token:
        token = request.headers.get("X-Session-Token")

    if token:
        data = verify_session_token(token)
        if data and isinstance(data, dict):
            profile_id = data.get("profile_id")
            if profile_id:
                prof = db.query(Profile).filter(Profile.id == profile_id, Profile.is_active == 1).first()
                if prof:
                    return prof
            if data.get("authenticated") is True:
                prof = db.query(Profile).filter(Profile.role == "admin", Profile.is_active == 1).first()
                if prof:
                    return prof

    # 3. Check if household requires PIN
    pin_row = db.query(Setting).filter(Setting.key == "household_pin_required").first()
    pin_required = False
    if pin_row:
        try:
            pin_required = bool(json.loads(pin_row.value_json))
        except Exception:
            pass

    master_pin_row = db.query(Setting).filter(Setting.key == "pin_hash").first()
    if master_pin_row:
        try:
            if json.loads(master_pin_row.value_json):
                pin_required = True
        except Exception:
            pass

    # If any profile has a PIN or household PIN is required, do NOT auto-login
    if pin_required:
        return None

    profiles_with_pin = db.query(Profile).filter(Profile.pin_hash.isnot(None), Profile.is_active == 1).count()
    if profiles_with_pin > 0:
        return None

    # Open single-user mode: default to the first active Admin
    return db.query(Profile).filter(Profile.role == "admin", Profile.is_active == 1).first()


def require(role_or_perm: str) -> Callable:
    """
    FastAPI dependency factory enforcing roles and permissions.
    - If display profile (is_display == 1): only 'wall:read' and GET /profiles/me are allowed.
    - If role (viewer, member, admin): enforces hierarchy admin > member > viewer.
    - If permission string: checks PERMISSIONS map.
    """
    def dependency(request: Request, db: Session = Depends(get_db)) -> Profile:
        profile = get_current_profile(request, db)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "PROFILE_REQUIRED", "message": "Authentication and active profile required"}}
            )

        # Display profile restrictions
        if profile.is_display:
            if role_or_perm != "wall:read" and not (request.url.path.endswith("/profiles/me") and request.method == "GET"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"error": {"code": "FORBIDDEN", "message": "Display profiles are restricted to wall display"}}
                )
            return profile

        # Role or permission check
        if role_or_perm in ROLE_LEVELS:
            required_level = ROLE_LEVELS[role_or_perm]
            user_level = ROLE_LEVELS.get(profile.role, 0)
            if user_level < required_level:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"error": {"code": "FORBIDDEN", "message": f"Requires {role_or_perm} role"}}
                )
            return profile

        allowed_roles = PERMISSIONS.get(role_or_perm)
        if not allowed_roles:
            # Unknown permission defaults to admin only
            allowed_roles = ["admin"]

        if profile.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": f"Permission denied for '{role_or_perm}'"}}
            )

        return profile

    return dependency
