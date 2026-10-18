from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.api.deps import require_roles
from app.models.pagination import Page
from app.models.user import User
from app.models.wellbeing import WellbeingFeaturesIn, WellbeingHistoryItem, WellbeingPredictionOut
from app.services.wellbeing_service import delete_history_item, get_history, predict_and_store
from ml.wellbeing_indicator.model import WellbeingModelNotTrained

router = APIRouter(prefix="/wellbeing", tags=["wellbeing"])

# Admin: full access always (see require_roles). Student: no access — this
# module scores a student's own wellbeing, not something they self-report
# through here. Parent: gets a plain-language summary, not the full
# breakdown (handled below, not by the role check).
_ALLOWED = require_roles("teacher", "counselor", "parent")


@router.post("/predict", response_model=WellbeingPredictionOut)
async def predict_wellbeing(payload: WellbeingFeaturesIn, user: User = Depends(_ALLOWED)):
    try:
        result = await predict_and_store(payload, user)
    except WellbeingModelNotTrained as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    if user.role == "parent":
        # Plain-language summary only — not the full score/dimension
        # breakdown a teacher or counselor sees. Returning a Response
        # directly here bypasses the declared response_model, which is
        # intentional: parents get a genuinely different, smaller shape.
        return JSONResponse({
            "summary": result.score_narrative,
            "risk_label": result.risk_label,
        })
    return result


@router.get("/history", response_model=Page[WellbeingHistoryItem])
async def wellbeing_history(
    user: User = Depends(_ALLOWED),
    page: int = Query(1, ge=1, description="1-based page number."),
    page_size: int = Query(10, ge=1, le=100, description="Entries per page."),
    student_id: str | None = Query(None, description="Registered student account id (Mongo ObjectId) — see GET /students"),
) -> Page[WellbeingHistoryItem]:
    """Real check-in history for the logged-in account, most recent first —
    replaces what was previously a browser-session-only list in the frontend.
    Optionally narrowed to a single student via ?student_id=.

    Deliberately NOT reduced for a parent (unlike /predict's live result and
    /risk/history): the History tab's stats/sparkline/timeline are a
    genuine, meaningful trend view of a parent's OWN linked child's
    wellbeing over time, not a one-off clinical decision a parent might
    misread out of context — different tradeoff, kept intentionally
    inconsistent with Risk's stricter reduction rather than "fixed" to
    match it, since doing so breaks the History visualizations client-side
    (they need the numeric score)."""
    return await get_history(user, page=page, page_size=page_size, student_id=student_id)


@router.delete("/history/{assessment_id}", status_code=204)
async def delete_wellbeing_history_item(assessment_id: str, user: User = Depends(_ALLOWED)) -> None:
    await delete_history_item(assessment_id, user)
