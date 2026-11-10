import re
import string
from datetime import datetime, timezone, date, timedelta
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.db import get_db
from backend.app.models import Item, Location, Photo, HealthIgnore, Profile
from backend.app.schemas import (
    HealthItemOut, HealthIgnoreRequest, SuccessResponse
)
from backend.app.services.visibility import items_visible
from backend.app.services.permissions import require

router = APIRouter(tags=["Health"])

def normalize_name(name: str) -> str:
    """Normalize item name: lowercase, strip punctuation, collapse whitespace."""
    s = name.lower()
    # Remove punctuation
    s = s.translate(str.maketrans("", "", string.punctuation))
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return s

@router.get("/health")
def get_health_overview(
    db: Session = Depends(get_db),
    # Optional permission to allow unauthenticated system ping or authenticated data health check
):
    """
    Combined system liveness check and Data Health summary counts.
    Retains status='ok' and time for v1 backward-compatibility.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    # Active visible items
    active_items = items_visible(db).all()
    active_ids = {it.id for it in active_items}

    # Ignores map: (check_key, item_id, other_item_id)
    ignores = db.query(HealthIgnore).all()
    ignore_set = {(ig.check_key, ig.item_id, ig.other_item_id) for ig in ignores}

    # 1. No Location
    no_loc_count = 0
    for it in active_items:
        if ("no_location", it.id, None) in ignore_set:
            continue
        if not it.location_id:
            no_loc_count += 1
        elif it.location and it.location.deleted_at is not None:
            no_loc_count += 1

    # 2. No Photo
    items_with_photos = {
        r[0] for r in db.query(Photo.owner_id).filter(Photo.owner_type == "item", Photo.owner_id.in_(active_ids)).all()
    } if active_ids else set()
    no_photo_count = 0
    for it in active_items:
        if ("no_photo", it.id, None) in ignore_set:
            continue
        if it.id not in items_with_photos:
            no_photo_count += 1

    # 3. Long Expired (> 90 days past)
    cutoff_date = (date.today() - timedelta(days=90)).isoformat()
    long_expired_count = 0
    for it in active_items:
        if ("long_expired", it.id, None) in ignore_set:
            continue
        if it.expiry_date and it.expiry_date < cutoff_date:
            long_expired_count += 1

    # 4. Possible Duplicates (same category & normalized name)
    dups_count = 0
    cat_names: Dict[tuple, List[Item]] = {}
    for it in active_items:
        norm = normalize_name(it.name)
        key = (it.category_id, norm)
        cat_names.setdefault(key, []).append(it)

    seen_pairs = set()
    for (cid, norm), group in cat_names.items():
        if len(group) > 1:
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    id1, id2 = sorted([group[i].id, group[j].id])
                    if (id1, id2) in seen_pairs:
                        continue
                    seen_pairs.add((id1, id2))
                    if ("duplicate", id1, id2) not in ignore_set and ("duplicate", id2, id1) not in ignore_set:
                        dups_count += 1

    # 5. Stale Inbox (> 14 days old)
    stale_inbox_cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    stale_inbox_items = db.query(Item).filter(
        Item.status == "inbox",
        Item.deleted_at.is_(None),
        Item.captured_at.isnot(None),
        Item.captured_at < stale_inbox_cutoff
    ).all()
    stale_inbox_count = sum(1 for it in stale_inbox_items if ("stale_inbox", it.id, None) not in ignore_set)

    return {
        "status": "ok",
        "time": now_iso,
        "no_location": no_loc_count,
        "no_photo": no_photo_count,
        "long_expired": long_expired_count,
        "duplicates": dups_count,
        "stale_inbox": stale_inbox_count,
    }

@router.get("/health/{check_name}", response_model=List[HealthItemOut])
def get_health_items(
    check_name: str,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("viewer"))
):
    """Retrieve detailed items for a specific health check."""
    ignores = db.query(HealthIgnore).filter(HealthIgnore.check_key == check_name).all()
    ignore_set = {(ig.item_id, ig.other_item_id) for ig in ignores}

    active_items = items_visible(db).all()
    results: List[HealthItemOut] = []

    if check_name == "no_location":
        for it in active_items:
            if (it.id, None) in ignore_set:
                continue
            if not it.location_id or (it.location and it.location.deleted_at is not None):
                results.append(HealthItemOut(
                    id=it.id,
                    name=it.name,
                    category_name=it.category.name if it.category else None,
                    location_path=None,
                    reason="No storage location assigned"
                ))

    elif check_name == "no_photo":
        items_with_photos = {
            r[0] for r in db.query(Photo.owner_id).filter(Photo.owner_type == "item").all()
        }
        for it in active_items:
            if (it.id, None) in ignore_set:
                continue
            if it.id not in items_with_photos:
                results.append(HealthItemOut(
                    id=it.id,
                    name=it.name,
                    category_name=it.category.name if it.category else None,
                    location_path=it.location.name if it.location else None,
                    reason="Missing photo"
                ))

    elif check_name == "long_expired":
        cutoff = (date.today() - timedelta(days=90)).isoformat()
        for it in active_items:
            if (it.id, None) in ignore_set:
                continue
            if it.expiry_date and it.expiry_date < cutoff:
                results.append(HealthItemOut(
                    id=it.id,
                    name=it.name,
                    category_name=it.category.name if it.category else None,
                    location_path=it.location.name if it.location else None,
                    reason=f"Expired on {it.expiry_date} (>90 days ago)"
                ))

    elif check_name == "duplicates":
        cat_names: Dict[tuple, List[Item]] = {}
        for it in active_items:
            norm = normalize_name(it.name)
            key = (it.category_id, norm)
            cat_names.setdefault(key, []).append(it)

        seen_pairs = set()
        for (cid, norm), group in cat_names.items():
            if len(group) > 1:
                for i in range(len(group)):
                    for j in range(i + 1, len(group)):
                        it1, it2 = group[i], group[j]
                        pair = tuple(sorted([it1.id, it2.id]))
                        if pair in seen_pairs:
                            continue
                        seen_pairs.add(pair)
                        if (pair[0], pair[1]) in ignore_set or (pair[1], pair[0]) in ignore_set:
                            continue
                        results.append(HealthItemOut(
                            id=it1.id,
                            name=it1.name,
                            category_name=it1.category.name if it1.category else None,
                            location_path=it1.location.name if it1.location else None,
                            reason=f"Possible duplicate of '{it2.name}' (#{it2.id})",
                            other_item_id=it2.id
                        ))

    elif check_name == "stale_inbox":
        cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
        items = db.query(Item).filter(
            Item.status == "inbox",
            Item.deleted_at.is_(None),
            Item.captured_at.isnot(None),
            Item.captured_at < cutoff
        ).all()
        for it in items:
            if (it.id, None) in ignore_set:
                continue
            results.append(HealthItemOut(
                id=it.id,
                name=it.name,
                category_name=None,
                location_path=it.location.name if it.location else None,
                reason=f"Inbox item captured on {it.captured_at[:10]} (>14 days ago)"
            ))

    return results

@router.post("/health/ignore", response_model=SuccessResponse)
def ignore_health_finding(
    payload: HealthIgnoreRequest,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    existing = db.query(HealthIgnore).filter(
        HealthIgnore.check_key == payload.check_key,
        HealthIgnore.item_id == payload.item_id,
        HealthIgnore.other_item_id == payload.other_item_id
    ).first()

    if not existing:
        ig = HealthIgnore(
            check_key=payload.check_key,
            item_id=payload.item_id,
            other_item_id=payload.other_item_id,
            ignored_by=current.id
        )
        db.add(ig)
        db.commit()

    return SuccessResponse(ok=True, message="Finding marked as ignored")

@router.delete("/health/ignore/{ignore_id}", response_model=SuccessResponse)
def delete_health_ignore(
    ignore_id: int,
    db: Session = Depends(get_db),
    current: Profile = Depends(require("member"))
):
    ig = db.query(HealthIgnore).filter(HealthIgnore.id == ignore_id).first()
    if not ig:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ignore record not found"}})
    db.delete(ig)
    db.commit()
    return SuccessResponse(ok=True, message="Ignore record removed")
