import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from backend.app.core.db import get_db
from backend.app.core.security import (
    hash_pin, verify_pin, create_session_token, is_rate_limited,
    record_failed_attempt, clear_failed_attempts
)
from backend.app.models import Profile, Setting
from backend.app.schemas import (
    ProfileOut, ProfileCreate, ProfileUpdate, ProfilePrefsUpdate,
    ProfileSelectRequest, SuccessResponse
)
from backend.app.services.permissions import require, get_current_profile

router = APIRouter(prefix="/profiles", tags=["Profiles"])

SESSION_COOKIE_NAME = "hi_session"

def _profile_to_out(p: Profile) -> ProfileOut:
    perms = None
    if p.custom_permissions_json:
        try:
            perms = json.loads(p.custom_permissions_json)
        except Exception:
            perms = None
    return ProfileOut(
        id=p.id,
        name=p.name,
        username=p.username or p.name.lower().replace(" ", ""),
        color=p.color,
        avatar_emoji=p.avatar_emoji,
        role=p.role,
        is_active=bool(p.is_active),
        must_change_password=bool(p.must_change_password),
        custom_permissions=perms,
        accent_color=p.accent_color,
        language=p.language,
        text_scale=p.text_scale or 100,
        high_contrast=bool(p.high_contrast),
        theme_mode=p.theme_mode or "system",
        is_display=bool(p.is_display),
        has_pin=bool(p.pin_hash),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )

@router.get("", response_model=List[ProfileOut])
def list_profiles(include_inactive: bool = False, db: Session = Depends(get_db)):
    """List profiles for the 'Who's using?' picker or admin settings."""
    q = db.query(Profile)
    if not include_inactive:
        q = q.filter(Profile.is_active == 1)
    return [_profile_to_out(p) for p in q.order_by(Profile.id).all()]

@router.post("", response_model=ProfileOut)
def create_profile(payload: ProfileCreate, db: Session = Depends(get_db), current: Profile = Depends(require("profiles:write"))):
    """Admin or Co-Admin creates a new household profile."""
    name_clean = payload.name.strip()
    username_clean = payload.username.strip().lower() if payload.username else name_clean.lower().replace(" ", "")

    existing = db.query(Profile).filter((Profile.name == name_clean) | (Profile.username == username_clean)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "DUPLICATE_NAME", "message": f"Profile or username '{name_clean}' already exists"}}
        )

    # Only admin can create another admin or co-admin
    if payload.role in ("admin", "co_admin") and current.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Only an Admin can create Admin or Co-Admin roles"}}
        )

    # Display profile rule: role must be viewer, no PIN
    role = "viewer" if payload.is_display else payload.role
    raw_pwd = payload.password or payload.pin
    pin_h = hash_pin(raw_pwd.strip()) if raw_pwd and not payload.is_display else None
    perms_json = json.dumps(payload.custom_permissions) if payload.custom_permissions else None

    prof = Profile(
        name=name_clean,
        username=username_clean,
        color=payload.color or "#1976d2",
        avatar_emoji=payload.avatar_emoji or "👤",
        role=role,
        pin_hash=pin_h,
        must_change_password=0,
        custom_permissions_json=perms_json,
        is_active=1,
        is_display=1 if payload.is_display else 0,
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return _profile_to_out(prof)

@router.get("/me", response_model=ProfileOut)
def get_my_profile(request: Request, db: Session = Depends(get_db)):
    """Returns the currently active profile or 401."""
    prof = get_current_profile(request, db)
    if not prof:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "NOT_LOGGED_IN", "message": "No active profile selected"}}
        )
    return _profile_to_out(prof)

@router.post("/select", response_model=ProfileOut)
def select_profile(
    payload: ProfileSelectRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """Select profile with optional PIN; sets session cookie."""
    ip = request.client.host if request.client else "127.0.0.1"
    if is_rate_limited(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": {"code": "RATE_LIMITED", "message": "Too many failed attempts. Try again in 1 minute."}}
        )

    prof = db.query(Profile).filter(Profile.id == payload.profile_id, Profile.is_active == 1).first()
    if not prof:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": "Profile not found or inactive"}}
        )

    if prof.pin_hash:
        if not payload.pin or not verify_pin(payload.pin.strip(), prof.pin_hash):
            record_failed_attempt(ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "INVALID_PIN", "message": "Incorrect PIN"}}
            )

    clear_failed_attempts(ip)
    # Remember profile days (365 for display, 30 default)
    days = 365 if prof.is_display else 30
    token = create_session_token({"profile_id": prof.id, "role": prof.role, "authenticated": True})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=86400 * days,
        httponly=True,
        samesite="lax"
    )
    return _profile_to_out(prof)

@router.post("/logout", response_model=SuccessResponse)
def logout(response: Response):
    """Clears profile session cookie."""
    response.delete_cookie(SESSION_COOKIE_NAME)
    return SuccessResponse(ok=True, message="Logged out successfully")

@router.put("/me/prefs", response_model=ProfileOut)
def update_my_prefs(
    payload: ProfilePrefsUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update current user's display preferences (accent, language, text scale, contrast, theme)."""
    prof = get_current_profile(request, db)
    if not prof:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "NOT_LOGGED_IN", "message": "Profile required"}}
        )

    if payload.name is not None and payload.name.strip():
        prof.name = payload.name.strip()
    if payload.avatar_emoji is not None:
        prof.avatar_emoji = payload.avatar_emoji
    if payload.color is not None:
        prof.color = payload.color
    if payload.accent_color is not None:
        prof.accent_color = payload.accent_color
    if payload.language is not None:
        prof.language = payload.language
    if payload.text_scale is not None:
        prof.text_scale = payload.text_scale
    if payload.high_contrast is not None:
        prof.high_contrast = 1 if payload.high_contrast else 0
    if payload.theme_mode is not None:
        prof.theme_mode = payload.theme_mode

    db.commit()
    db.refresh(prof)
    return _profile_to_out(prof)

@router.put("/{profile_id}/prefs", response_model=ProfileOut)
def update_other_prefs(
    profile_id: int,
    payload: ProfilePrefsUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    """Admin updates another profile's preferences."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})

    if payload.name is not None and payload.name.strip():
        prof.name = payload.name.strip()
    if payload.avatar_emoji is not None:
        prof.avatar_emoji = payload.avatar_emoji
    if payload.color is not None:
        prof.color = payload.color
    if payload.accent_color is not None:
        prof.accent_color = payload.accent_color
    if payload.language is not None:
        prof.language = payload.language
    if payload.text_scale is not None:
        prof.text_scale = payload.text_scale
    if payload.high_contrast is not None:
        prof.high_contrast = 1 if payload.high_contrast else 0
    if payload.theme_mode is not None:
        prof.theme_mode = payload.theme_mode

    db.commit()
    db.refresh(prof)
    return _profile_to_out(prof)

@router.put("/{profile_id}", response_model=ProfileOut)
def update_profile(
    profile_id: int,
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("profiles:write"))
):
    """Admin or Co-Admin updates profile details or password."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})

    # Co-Admin cannot edit an Admin
    if prof.role == "admin" and current.role != "admin" and prof.id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Co-Admins cannot modify Admin accounts"}}
        )

    if payload.name is not None and payload.name.strip() != prof.name:
        existing = db.query(Profile).filter(Profile.name == payload.name.strip(), Profile.id != prof.id).first()
        if existing:
            raise HTTPException(status_code=400, detail={"error": {"code": "DUPLICATE_NAME", "message": "Name taken"}})
        prof.name = payload.name.strip()

    if payload.username is not None and payload.username.strip().lower() != (prof.username or ""):
        u_clean = payload.username.strip().lower()
        existing = db.query(Profile).filter(Profile.username == u_clean, Profile.id != prof.id).first()
        if existing:
            raise HTTPException(status_code=400, detail={"error": {"code": "DUPLICATE_USERNAME", "message": "Username taken"}})
        prof.username = u_clean

    if payload.color is not None:
        prof.color = payload.color
    if payload.avatar_emoji is not None:
        prof.avatar_emoji = payload.avatar_emoji

    if payload.role is not None and payload.role != prof.role:
        if prof.role == "admin" and payload.role != "admin":
            # Last admin check
            admin_count = db.query(Profile).filter(Profile.role == "admin", Profile.is_active == 1).count()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail={"error": {"code": "LAST_ADMIN", "message": "Cannot demote the last remaining active Admin"}}
                )
        if payload.role in ("admin", "co_admin") and current.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": "Only an Admin can assign Admin or Co-Admin roles"}}
            )
        prof.role = payload.role

    raw_pwd = payload.password or payload.pin
    if raw_pwd is not None:
        prof.pin_hash = hash_pin(raw_pwd.strip()) if raw_pwd.strip() else None

    if payload.must_change_password is not None:
        prof.must_change_password = 1 if payload.must_change_password else 0

    if payload.custom_permissions is not None:
        prof.custom_permissions_json = json.dumps(payload.custom_permissions) if payload.custom_permissions else None

    if payload.is_active is not None:
        if not payload.is_active and prof.role == "admin":
            admin_count = db.query(Profile).filter(Profile.role == "admin", Profile.is_active == 1).count()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail={"error": {"code": "LAST_ADMIN", "message": "Cannot deactivate the last remaining active Admin"}}
                )
        prof.is_active = 1 if payload.is_active else 0

    db.commit()
    db.refresh(prof)
    return _profile_to_out(prof)

@router.delete("/{profile_id}", response_model=SuccessResponse)
def deactivate_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    """Deactivate profile (profiles with history are never deleted to preserve actor names)."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})

    if prof.role == "admin":
        admin_count = db.query(Profile).filter(Profile.role == "admin", Profile.is_active == 1).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "LAST_ADMIN", "message": "Cannot deactivate the last remaining active Admin"}}
            )

    prof.is_active = 0
    db.commit()
    return SuccessResponse(ok=True, message=f"Profile '{prof.name}' deactivated")
