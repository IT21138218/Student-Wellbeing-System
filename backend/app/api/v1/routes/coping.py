from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import require_roles
from app.models.coping import (
    CopingFeedbackIn, CopingFeedbackOut, CopingFeaturesIn, CopingHistoryItem, CopingRecommendationOut,
)
from app.models.pagination import Page
from app.models.user import User
from app.services.coping_service import delete_history_item, get_history, recommend_and_store, submit_feedback
from ml.coping_recommendation.model import CopingModelNotTrained

router = APIRouter(prefix="/coping", tags=["coping"])

# Admin: full access always. Teacher/counselor: run it for a student they're
# supporting. Student: use it themselves. Parent: no access — this is a
# live coping-strategy tool, not something to review after the fact.
_ALLOWED = require_roles("teacher", "counselor", "student")


@router.post("/recommend", response_model=CopingRecommendationOut)
async def recommend_coping(payload: CopingFeaturesIn, user: User = Depends(_ALLOWED)) -> CopingRecommendationOut:
    try:
        return await recommend_and_store(payload, user)
    except CopingModelNotTrained as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/history", response_model=Page[CopingHistoryItem])
async def coping_history(
    user: User = Depends(_ALLOWED),
    page: int = Query(1, ge=1, description="1-based page number."),
    page_size: int = Query(10, ge=1, le=100, description="Entries per page."),
) -> Page[CopingHistoryItem]:
    return await get_history(user, page=page, page_size=page_size)


@router.delete("/history/{record_id}", status_code=204)
async def delete_coping_history_item(record_id: str, user: User = Depends(_ALLOWED)) -> None:
    await delete_history_item(record_id, user)


@router.post("/{record_id}/feedback", response_model=CopingFeedbackOut)
async def coping_feedback(
    record_id: str, payload: CopingFeedbackIn, user: User = Depends(_ALLOWED)
) -> CopingFeedbackOut:
    """Report back whether a past recommendation actually helped."""
    return await submit_feedback(record_id, user, payload.actual_effectiveness)
