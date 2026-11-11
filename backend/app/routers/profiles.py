import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.app.core.config import PHOTOS_DIR
from backend.app.core.db import get_db
from backend.app.core.security import (
    hash_pin, verify_pin, create_session_token, is_rate_limited,
    record_failed_attempt, clear_failed_attempts, SESSION_COOKIE_NAME
)
from backend.app.models import (
    Activity,
    Attachment,
    Audit,
    Category,
    HealthIgnore,
    Item,
    LabelTemplate,
    Location,
    Move,
    Profile,
    ReminderState,
    SavedFilter,
)
from backend.app.schemas import (
    ProfileOut, ProfileCreate, ProfileUpdate, ProfilePrefsUpdate,
    ProfileSelectRequest, SuccessResponse
)
from backend.app.services.permissions import require, get_current_profile
from backend.app.services.photo_service import (
    delete_owner_photo_dir,
    delete_photo_files,
    process_and_save_image,
)

router = APIRouter(prefix="/profiles", tags=["Profiles"])


def _profile_avatar_url(p: Profile) -> Optional[str]:
    if not p.avatar_photo_filename:
        return None
    return f"/api/profiles/{p.id}/avatar?v={p.avatar_photo_filename}"


def _thumb_name_for(file_name: str) -> str:
    return f"{Path(file_name).stem}_thumb.jpg"


def _clear_profile_avatar_files(profile_id: int, file_name: Optional[str]) -> None:
    if not file_name:
        return
    delete_photo_files("profile", profile_id, file_name, _thumb_name_for(file_name))


def _resolve_profile_avatar_path(profile_id: int, file_name: str, prefer_thumb: bool = True) -> Path:
    base_dir = (PHOTOS_DIR / "profile" / str(profile_id)).resolve()
    candidates = [_thumb_name_for(file_name), file_name] if prefer_thumb else [file_name, _thumb_name_for(file_name)]
    for candidate in candidates:
        resolved = (base_dir / candidate).resolve()
        if resolved.is_relative_to(base_dir) and resolved.is_file():
            return resolved
    raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile picture file not found"}})


def _save_uploaded_profile_avatar(db: Session, prof: Profile, upload_file: UploadFile) -> ProfileOut:
    old_file_name = prof.avatar_photo_filename
    file_name, _, _, _, _ = process_and_save_image(upload_file, "profile", prof.id)
    prof.avatar_photo_filename = file_name
    db.commit()
    db.refresh(prof)
    if old_file_name and old_file_name != file_name:
        _clear_profile_avatar_files(prof.id, old_file_name)
    return _profile_to_out(prof)


def _delete_profile_avatar(db: Session, prof: Profile) -> ProfileOut:
    old_file_name = prof.avatar_photo_filename
    prof.avatar_photo_filename = None
    db.commit()
    db.refresh(prof)
    _clear_profile_avatar_files(prof.id, old_file_name)
    return _profile_to_out(prof)


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
        avatar_url=_profile_avatar_url(p),
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
def list_profiles(request: Request, include_inactive: bool = False, db: Session = Depends(get_db)):
    """List profiles for the 'Who's using?' picker or admin settings."""
    if include_inactive:
        require("profiles:write")(request, db)
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
        avatar_emoji=payload.avatar_emoji or "Person",
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

def _apply_prefs(db: Session, prof: Profile, payload: ProfilePrefsUpdate) -> None:
    if payload.name is not None and payload.name.strip():
        clean_name = payload.name.strip()
        if clean_name != prof.name:
            existing = db.query(Profile).filter(Profile.name == clean_name, Profile.id != prof.id).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": {"code": "DUPLICATE_NAME", "message": f"Profile name '{clean_name}' already exists"}}
                )
            prof.name = clean_name
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

@router.put("/me/prefs", response_model=ProfileOut)
def update_my_prefs(
    payload: ProfilePrefsUpdate,
    db: Session = Depends(get_db),
    prof: Profile = Depends(require("prefs:write_own"))
):
    """Update current user's display preferences (accent, language, text scale, contrast, theme)."""
    _apply_prefs(db, prof, payload)
    db.commit()
    db.refresh(prof)
    return _profile_to_out(prof)


@router.post("/me/avatar", response_model=ProfileOut)
def upload_my_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    prof: Profile = Depends(require("prefs:write_own"))
):
    """Upload or replace the signed-in user's own profile picture."""
    return _save_uploaded_profile_avatar(db, prof, file)


@router.delete("/me/avatar", response_model=ProfileOut)
def remove_my_avatar(
    db: Session = Depends(get_db),
    prof: Profile = Depends(require("prefs:write_own"))
):
    """Remove the signed-in user's own uploaded profile picture."""
    return _delete_profile_avatar(db, prof)


@router.get("/{profile_id}/avatar")
def get_profile_avatar(
    profile_id: int,
    request: Request,
    size: str = Query("thumb"),
    db: Session = Depends(get_db),
):
    """Serve an uploaded profile picture (public for active picker profiles; restricted for inactive)."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof or not prof.avatar_photo_filename:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile picture not found"}})

    if not prof.is_active:
        current = get_current_profile(request, db)
        if not current or current.role not in ("admin", "co_admin"):
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile picture not found"}})

    file_path = _resolve_profile_avatar_path(prof.id, prof.avatar_photo_filename, prefer_thumb=(size != "full"))
    return FileResponse(
        str(file_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/{profile_id}/avatar", response_model=ProfileOut)
def upload_profile_avatar(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: Profile = Depends(require("profiles:write"))
):
    """Admin or Co-Admin uploads/replaces a user's profile picture."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    if prof.role == "admin" and current.role != "admin" and prof.id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Co-Admins cannot modify Admin accounts"}}
        )
    return _save_uploaded_profile_avatar(db, prof, file)


@router.delete("/{profile_id}/avatar", response_model=ProfileOut)
def remove_profile_avatar(
    profile_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("profiles:write"))
):
    """Admin or Co-Admin removes a user's uploaded profile picture."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    if prof.role == "admin" and current.role != "admin" and prof.id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Co-Admins cannot modify Admin accounts"}}
        )
    return _delete_profile_avatar(db, prof)

@router.put("/{profile_id}/prefs", response_model=ProfileOut)
def update_other_prefs(
    profile_id: int,
    payload: ProfilePrefsUpdate,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("prefs:write_all"))
):
    """Admin or Co-Admin updates another profile's preferences."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})

    _apply_prefs(db, prof, payload)
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
def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("admin"))
):
    """Permanently delete a user profile (preserves inventory records & borrower names; blocks last admin and self)."""
    prof = db.query(Profile).filter(Profile.id == profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})

    if prof.role == "admin" and prof.is_active == 1:
        other_active_admins = (
            db.query(Profile)
            .filter(Profile.role == "admin", Profile.is_active == 1, Profile.id != prof.id)
            .count()
        )
        if other_active_admins == 0:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "LAST_ADMIN", "message": "Cannot delete the last remaining active Admin"}}
            )

    if prof.id == current.id:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "SELF_DELETE", "message": "Cannot delete the currently signed-in account"}}
        )

    prof_name = prof.name
    prof_id = prof.id

    # Preserve borrower name on loaned items while detaching profile foreign key
    loaned_items = db.query(Item).filter(Item.taken_by_profile_id == prof_id).all()
    for it in loaned_items:
        if not (it.taken_by and it.taken_by.strip()):
            it.taken_by = prof_name
        it.taken_by_profile_id = None

    # Detach optional historical foreign keys and remove user-owned preferences/state
    db.query(Activity).filter(Activity.actor_id == prof_id).update({"actor_id": None})
    db.query(Item).filter(Item.retired_by == prof_id).update({"retired_by": None})
    db.query(Item).filter(Item.deleted_by == prof_id).update({"deleted_by": None})
    db.query(Location).filter(Location.deleted_by == prof_id).update({"deleted_by": None})
    db.query(Category).filter(Category.deleted_by == prof_id).update({"deleted_by": None})
    db.query(Attachment).filter(Attachment.uploaded_by == prof_id).update({"uploaded_by": None})
    db.query(Audit).filter(Audit.started_by == prof_id).update({"started_by": None})
    db.query(HealthIgnore).filter(HealthIgnore.ignored_by == prof_id).update({"ignored_by": None})
    db.query(Move).filter(Move.created_by == prof_id).update({"created_by": None})

    db.query(ReminderState).filter(ReminderState.profile_id == prof_id).delete()
    db.query(SavedFilter).filter(SavedFilter.profile_id == prof_id).delete()
    db.query(LabelTemplate).filter(LabelTemplate.owner_id == prof_id).delete()

    db.delete(prof)
    db.commit()

    delete_owner_photo_dir("profile", prof_id)
    return SuccessResponse(ok=True, message=f"Profile '{prof_name}' deleted")
