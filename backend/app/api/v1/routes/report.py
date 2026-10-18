from fastapi import APIRouter, Depends, Query

from app.api.deps import require_roles
from app.models.report import CohortReport
from app.models.user import User
from app.services.report_service import build_cohort_report

router = APIRouter(prefix="/reports", tags=["reports"])

# Admin: full access always (require_roles' unconditional bypass). Counselor:
# this is exactly their remit — cohort-wide wellbeing/risk oversight for
# leadership. Teacher/Student/Parent: no access — this aggregates across
# every student, not just one class or one child.
_ALLOWED = require_roles("counselor")


@router.get("/cohort", response_model=CohortReport)
async def cohort_report(
    days: int = Query(30, ge=1, le=365, description="Window for the activity_over_time trend."),
    _: User = Depends(_ALLOWED),
) -> CohortReport:
    return await build_cohort_report(days)
