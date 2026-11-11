import json
from typing import Optional, Callable
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.core.security import verify_session_token, SESSION_COOKIE_NAME
from backend.app.models import Profile, Setting

ROLE_LEVELS = {
    "admin": 4,
    "co_admin": 3,
    "member": 2,
    "viewer": 1,
}

PERMISSIONS = {
    # Viewer actions:
    "items:read": ["viewer", "member", "co_admin", "admin"],
    "locations:read": ["viewer", "member", "co_admin", "admin"],
    "categories:read": ["viewer", "member", "co_admin", "admin"],
    "activity:read": ["viewer", "member", "co_admin", "admin"],
    "reminders:read": ["viewer", "member", "co_admin", "admin"],
    "attachments:read": ["viewer", "member", "co_admin", "admin"],
    "audit:read": ["viewer", "member", "co_admin", "admin"],
    "trash:read": ["viewer", "member", "co_admin", "admin"],
    "health:read": ["viewer", "member", "co_admin", "admin"],
    "contacts:read": ["viewer", "member", "co_admin", "admin"],
    "labels:read": ["viewer", "member", "co_admin", "admin"],
    "wall:read": ["viewer", "member", "co_admin", "admin"],
    "offline:read": ["viewer", "member", "co_admin", "admin"],
    "prefs:write_own": ["viewer", "member", "co_admin", "admin"],
    "search:read": ["viewer", "member", "co_admin", "admin"],

    # Member actions:
    "items:write": ["member", "co_admin", "admin"],
    "items:delete": ["member", "co_admin", "admin"],
    "photos:write": ["member", "co_admin", "admin"],
    "attachments:write": ["member", "co_admin", "admin"],
    "tags:write": ["member", "co_admin", "admin"],
    "bulk:write": ["member", "co_admin", "admin"],
    "audit:write": ["member", "co_admin", "admin"],
    "trash:restore": ["member", "co_admin", "admin"],
    "inbox:write": ["member", "co_admin", "admin"],
    "lifecycle:write": ["member", "co_admin", "admin"],
    "health:write": ["member", "co_admin", "admin"],
    "contacts:write": ["member", "co_admin", "admin"],
    "moves:write": ["member", "co_admin", "admin"],
    "labels:write_own": ["member", "co_admin", "admin"],
    "activity:revert": ["member", "co_admin", "admin"],
    "reminders:write": ["member", "co_admin", "admin"],

    # Admin & Co-Admin actions:
    "categories:write": ["co_admin", "admin"],
    "locations:write": ["co_admin", "admin"],
    "templates:write": ["co_admin", "admin"],
    "trash:purge": ["co_admin", "admin"],
    "profiles:write": ["co_admin", "admin"],
    "admin:settings": ["co_admin", "admin"],
    "admin:backup": ["admin"],
    "admin:export": ["co_admin", "admin"],
    "admin:import": ["co_admin", "admin"],
    "contacts:delete": ["co_admin", "admin"],
    "labels:write_all": ["co_admin", "admin"],
    "admin:book": ["co_admin", "admin"],
    "prefs:write_all": ["co_admin", "admin"],
    "admin:second_copy": ["admin"],
    "admin:webhook": ["admin"],
}

VIEWER_PERMISSIONS = {perm for perm, roles in PERMISSIONS.items() if "viewer" in roles}

def get_current_profile(request: Request, db: Session = Depends(get_db)) -> Optional[Profile]:
    # 1. Extract token from Cookie or Authorization header
    token = request.cookies.get(SESSION_COOKIE_NAME) or request.cookies.get("session")
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

    # 2. Check if household requires authentication (any active profile has a password/PIN)
    pin_row = db.query(Setting).filter(Setting.key == "household_pin_required").first()
    pin_required = False
    if pin_row:
        try:
            pin_required = bool(json.loads(pin_row.value_json))
        except (json.JSONDecodeError, TypeError):
            pin_required = False

    master_pin_row = db.query(Setting).filter(Setting.key == "pin_hash").first()
    if master_pin_row:
        try:
            if json.loads(master_pin_row.value_json):
                pin_required = True
        except (json.JSONDecodeError, TypeError):
            pin_required = False

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
    - If role == 'custom': viewer baseline reads plus exact grants from custom_permissions_json.
    - If role (viewer, member, co_admin, admin): enforces hierarchy admin > co_admin > member > viewer.
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

        # Custom role granular permission check (strictly no prefix escalation)
        if profile.role == "custom":
            custom_perms: set[str] = set()
            if profile.custom_permissions_json:
                try:
                    parsed = json.loads(profile.custom_permissions_json)
                    if isinstance(parsed, list):
                        custom_perms = {str(p) for p in parsed}
                except (json.JSONDecodeError, TypeError):
                    custom_perms = set()

            if "export:read" in custom_perms:
                custom_perms.update({"admin:export", "admin:book"})
            if "photos:write" in custom_perms:
                custom_perms.add("attachments:write")
            if "items:write" in custom_perms:
                custom_perms.update({"inbox:write", "lifecycle:write"})

            if role_or_perm == "viewer" or role_or_perm in VIEWER_PERMISSIONS:
                return profile
            if role_or_perm in custom_perms:
                return profile

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": f"Permission denied for '{role_or_perm}'"}}
            )

        # Role check
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
