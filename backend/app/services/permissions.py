import json
from typing import Optional, Callable
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.core.security import verify_session_token
from backend.app.models import Profile, Setting

ROLE_LEVELS = {
    "admin": 4,
    "co_admin": 3,
    "member": 2,
    "viewer": 1,
    "custom": 2,
}

PERMISSIONS = {
    # Viewer actions:
    "items:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "locations:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "categories:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "activity:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "reminders:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "attachments:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "audit:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "trash:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "health:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "contacts:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "labels:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "wall:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "offline:read": ["viewer", "member", "co_admin", "admin", "custom"],
    "prefs:write_own": ["viewer", "member", "co_admin", "admin", "custom"],
    "search:read": ["viewer", "member", "co_admin", "admin", "custom"],

    # Member actions:
    "items:write": ["member", "co_admin", "admin", "custom"],
    "items:delete": ["member", "co_admin", "admin", "custom"],
    "photos:write": ["member", "co_admin", "admin", "custom"],
    "attachments:write": ["member", "co_admin", "admin", "custom"],
    "tags:write": ["member", "co_admin", "admin", "custom"],
    "bulk:write": ["member", "co_admin", "admin", "custom"],
    "audit:write": ["member", "co_admin", "admin", "custom"],
    "trash:restore": ["member", "co_admin", "admin", "custom"],
    "inbox:write": ["member", "co_admin", "admin", "custom"],
    "lifecycle:write": ["member", "co_admin", "admin", "custom"],
    "health:write": ["member", "co_admin", "admin", "custom"],
    "contacts:write": ["member", "co_admin", "admin", "custom"],
    "moves:write": ["member", "co_admin", "admin", "custom"],
    "labels:write_own": ["member", "co_admin", "admin", "custom"],
    "activity:revert": ["member", "co_admin", "admin", "custom"],
    "reminders:write": ["member", "co_admin", "admin", "custom"],

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

def get_current_profile(request: Request, db: Session = Depends(get_db)) -> Optional[Profile]:
    # 1. Extract token from Cookie or Authorization header
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

    # 2. Test header override (fallback for tests without cookies)
    header_profile_id = request.headers.get("X-Profile-ID")
    if header_profile_id:
        try:
            pid = int(header_profile_id)
            prof = db.query(Profile).filter(Profile.id == pid, Profile.is_active == 1).first()
            if prof:
                return prof
        except ValueError:
            pass

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

        # Custom role permission check
        if profile.role == "custom" and profile.custom_permissions_json:
            try:
                custom_perms = json.loads(profile.custom_permissions_json)
                if role_or_perm in custom_perms or any(p.startswith(role_or_perm.split(":")[0]) for p in custom_perms):
                    return profile
            except Exception:
                pass

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
