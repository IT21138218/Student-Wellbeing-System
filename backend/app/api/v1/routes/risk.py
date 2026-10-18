from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.api.deps import require_roles
from app.models.pagination import Page
from app.models.risk import EscalateIn, EscalateOut, RiskFeaturesIn, RiskHistoryItem, RiskPredictionOut
from app.models.user import User
from app.services.risk_service import (
    classify_and_store, delete_history_item, escalate, get_all_history, get_history,
)
from ml.risk_classification.model import RiskModelNotTrained

router = APIRouter(prefix="/risk", tags=["risk"])

# Admin: full access always. Student: no access (this scores risk, not
# something a student should see raw). Parent: plain-language summary only.
_ALLOWED = require_roles("teacher", "counselor", "parent")
# Escalation is a staff action — a parent reads a summary, they don't triage.
_STAFF_ONLY = require_roles("teacher", "counselor")
# No args => only admin passes (see deps.require_roles) — same pattern as
# students.py's _ADMIN_ONLY / quiz.py's _ADMIN_ONLY.
_ADMIN_ONLY = require_roles()


@router.post("/classify", response_model=RiskPredictionOut)
async def classify_risk(payload: RiskFeaturesIn, user: User = Depends(_ALLOWED)):
    try:
        result = await classify_and_store(payload, user)
    except RiskModelNotTrained as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    if user.role == "parent":
        return JSONResponse({
            "summary": result.narrative,
            "risk_label": result.risk_label,
        })
    return result


@router.get("/history", response_model=None)
async def risk_history(
    user: User = Depends(_ALLOWED),
    page: int = Query(1, ge=1, description="1-based page number."),
    page_size: int = Query(10, ge=1, le=100, description="Entries per page."),
):
    """Returns Page[RiskHistoryItem] for staff, or the same page shape with
    items reduced to {risk_label, created_at} for a parent — the mixed item
    shape means no response_model can be declared, same reason /classify
    doesn't declare one for its parent branch either."""
    result = await get_history(user, page=page, page_size=page_size)
    if user.role == "parent":
        # Same reduction as /classify: no probabilities for a parent, plain-
        # language label + date only. `total`/`page`/`page_size` stay as-is
        # so pagination controls work identically for every role.
        return JSONResponse({
            "items": [{"risk_label": r.risk_label, "created_at": r.created_at.isoformat()} for r in result.items],
            "total": result.total, "page": result.page, "page_size": result.page_size,
        })
    return result


@router.delete("/history/{assessment_id}", status_code=204)
async def delete_risk_history_item(assessment_id: str, user: User = Depends(_ALLOWED)) -> None:
    await delete_history_item(assessment_id, user)


@router.get("/admin/overview", response_model=Page[RiskHistoryItem], dependencies=[Depends(_ADMIN_ONLY)])
async def admin_overview(
    page: int = Query(1, ge=1, description="1-based page number."),
    page_size: int = Query(10, ge=1, le=100, description="Entries per page."),
) -> Page[RiskHistoryItem]:
    """Every risk decision by every staff account, most recent first —
    admin-only cross-account view. Declared before /{assessment_id}/escalate
    so 'admin' isn't parsed as an assessment id."""
    return await get_all_history(page=page, page_size=page_size)


@router.post("/{assessment_id}/escalate", response_model=EscalateOut)
async def escalate_decision(
    assessment_id: str, payload: EscalateIn, user: User = Depends(_STAFF_ONLY)
) -> EscalateOut:
    return await escalate(assessment_id, user, payload.note)
