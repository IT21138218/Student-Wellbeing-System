from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.api.deps import get_current_user_optional, require_roles
from app.models.forecast import ForecastOut, NotEligibleOut, RealStudentOption, StudentSummary
from app.models.user import User
from app.services.forecast_service import (
    forecast_for,
    forecast_for_real_student,
    get_students,
    is_real_student_id,
    list_forecast_eligible_students,
)
from ml.wellbeing_forecasting.model import ForecastModelNotTrained

router = APIRouter(prefix="/forecast", tags=["forecast"])

# Admin: full access always. Student: no access. Parent: plain-language
# summary only. Note: the "class trend direction only" simplification for
# Teacher and "full trajectory" for Counselor both return the same full
# ForecastOut today — a real class-level aggregate view would need a new
# endpoint grouping by class/grade, which doesn't exist yet. Flagged here
# rather than silently pretended.
_ALLOWED = require_roles("teacher", "counselor", "parent")


@router.get("/students", response_model=None)
async def students(
    source: str = Query("csv", description="'csv' (default, training cohort) or 'real' (registered accounts)."),
    user: User | None = Depends(get_current_user_optional),
):
    """CSV (default): known training-cohort students with weekly history —
    see ml/wellbeing_forecasting/model.py for why this isn't live user data.
    Deliberately NOT role-gated: it only lists student IDs/grades for the
    picker UI (including the unauthenticated home-page search bar), not
    predictions — see /predict/{id} for the actual gated data.

    source=real: registered student accounts + their check-in counts. This
    branch IS gated (it exposes real names), and reuses the same
    parent-only-sees-linked-children rule as Wellbeing Indicator.
    """
    if source == "real":
        if user is None:
            raise HTTPException(status_code=401, detail="Not authenticated.")
        if user.role not in ("admin", "teacher", "counselor", "parent"):
            raise HTTPException(status_code=403, detail=f"Role '{user.role}' cannot access this.")
        return await list_forecast_eligible_students(user)

    try:
        return get_students()
    except ForecastModelNotTrained as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/predict/{student_id}", response_model=None)
async def predict(student_id: str, user: User = Depends(_ALLOWED)):
    """A CSV id ("S001") takes the original, unchanged path. A Mongo
    ObjectId routes to the real-student path, which may return a 200
    NotEligibleOut progress shape instead of a forecast."""
    try:
        if is_real_student_id(student_id):
            result = await forecast_for_real_student(student_id, user)
            if isinstance(result, NotEligibleOut):
                # Not an error: the student exists, they just need more
                # check-ins. Returned as-is for every role.
                return result
        else:
            result = forecast_for(student_id)
    except ForecastModelNotTrained as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    if user.role == "parent":
        # student_name is only set on the real-student path — the CSV path's
        # student_id ("S001") is already a fine label on its own.
        label = result.student_name or result.student_id
        return JSONResponse({
            "summary": (
                f"{label}'s wellbeing is predicted to be "
                f"{result.trend} next week ({result.current_score:.0f} -> "
                f"{result.predicted_next_week_score:.0f})."
            ),
            "trend": result.trend,
        })
    return result
