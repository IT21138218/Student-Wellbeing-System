from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user_optional, require_roles
from app.models.pagination import Page
from app.models.social import SocialHistoryItem, StudentSocialSummary
from app.models.user import User
from app.services.social_service import (
    delete_history_item,
    detect_for,
    detect_for_real_student,
    get_history,
    get_students,
    is_real_student_id,
    list_real_eligible_students,
)
from ml.social_peer_matching.model import SocialModelNotTrained

router = APIRouter(prefix="/social", tags=["social"])

# Admin: full access always. Teacher gets class-level isolation flags,
# Counselor gets the full profile — both currently return the same
# SocialDetectionOut (no class-grouping endpoint exists yet, same caveat as
# forecast.py). Student and Parent: no access at all for this module.
_ALLOWED = require_roles("teacher", "counselor")


@router.get("/students", response_model=None)
async def students(
    source: str = Query("csv", description="'csv' (default, training cohort) or 'real' (registered accounts)."),
    user: User | None = Depends(get_current_user_optional),
):
    """CSV (default): known training-cohort students with aggregated survey
    profiles — see ml/social_peer_matching/model.py. Deliberately NOT
    role-gated: only lists IDs/cluster labels for the picker UI, not the
    sensitive detection detail — see /detect/{id}.

    source=real: registered student accounts + their CopingRecord counts.
    This branch IS gated (real names), reusing the same
    parent-only-sees-linked-children rule as Wellbeing Indicator/Forecasting.
    """
    if source == "real":
        if user is None:
            raise HTTPException(status_code=401, detail="Not authenticated.")
        if user.role not in ("admin", "teacher", "counselor"):
            raise HTTPException(status_code=403, detail=f"Role '{user.role}' cannot access this.")
        return await list_real_eligible_students(user)

    try:
        return get_students()
    except SocialModelNotTrained as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/detect/{student_id}", response_model=None)
async def detect(student_id: str, user: User = Depends(_ALLOWED)):
    """A CSV id ("S001") takes the original, unchanged path. A Mongo
    ObjectId routes to the real-student path, which may return a 200
    SocialNotEligibleOut progress shape instead of a detection."""
    try:
        if is_real_student_id(student_id):
            return await detect_for_real_student(student_id, user)
        return await detect_for(student_id, user)
    except SocialModelNotTrained as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/history", response_model=Page[SocialHistoryItem])
async def social_history(
    user: User = Depends(_ALLOWED),
    page: int = Query(1, ge=1, description="1-based page number."),
    page_size: int = Query(10, ge=1, le=100, description="Entries per page."),
) -> Page[SocialHistoryItem]:
    return await get_history(user, page=page, page_size=page_size)


@router.delete("/history/{record_id}", status_code=204)
async def delete_social_history_item(record_id: str, user: User = Depends(_ALLOWED)) -> None:
    await delete_history_item(record_id, user)
