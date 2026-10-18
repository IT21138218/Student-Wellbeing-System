"""Forecasting has two history sources, side by side:

- CSV cohort (default): read-only replay over the 300-student training
  dataset — see ml/wellbeing_forecasting/model.py's docstring. No
  persistence step, just a lookup + prediction. UNCHANGED by the
  real-student work below.
- Real students: the same trained artifact run over a student's own stored
  WellbeingAssessment history, once they have enough of it.
"""

import asyncio

from beanie import PydanticObjectId

from app.models.forecast import ForecastOut, NotEligibleOut, RealStudentOption, StudentSummary
from app.models.user import User
from app.models.wellbeing import WellbeingAssessment
from app.services.student_service import list_student_options, resolve_student
from ml.wellbeing_forecasting.model import list_students, predict_for_student, predict_from_real_history
from ml.wellbeing_forecasting.real_features import MIN_HISTORY_WEEKS


def get_students() -> list[StudentSummary]:
    return [StudentSummary(**s) for s in list_students()]


def forecast_for(student_id: str) -> ForecastOut:
    return ForecastOut(**predict_for_student(student_id))


# ---- Real-student path ----


def is_real_student_id(student_id: str) -> bool:
    """A Mongo ObjectId means a real registered account; anything else
    (notably the CSV's "S001" ids) routes to the unchanged CSV path."""
    return PydanticObjectId.is_valid(student_id)


async def _count_checkins(student_id: str) -> int:
    return await WellbeingAssessment.find(WellbeingAssessment.student_id == student_id).count()


async def list_forecast_eligible_students(user: User) -> list[RealStudentOption]:
    """Registered students the caller may see, each with their stored
    check-in count and whether that clears MIN_HISTORY_WEEKS.

    Reuses list_student_options() rather than reimplementing the
    parent-only-sees-linked-children rule that Wellbeing Indicator already
    established.
    """
    options = await list_student_options(user)
    # Counts run concurrently — each is a separate Mongo round trip, so doing
    # them one by one made this endpoint take (students x latency).
    counts = await asyncio.gather(*(_count_checkins(opt.id) for opt in options))
    return [
        RealStudentOption(
            id=opt.id,
            full_name=opt.full_name,
            checkins_count=count,
            eligible=count >= MIN_HISTORY_WEEKS,
        )
        for opt, count in zip(options, counts)
    ]


async def forecast_for_real_student(student_id: str, user: User) -> ForecastOut | NotEligibleOut:
    """Ownership is enforced by resolve_student — the same helper the
    Wellbeing Indicator and Risk Classification paths use, so a parent
    still can't reach another family's child here."""
    student = await resolve_student(user, student_id)

    assessments = (
        await WellbeingAssessment.find(WellbeingAssessment.student_id == student_id)
        .sort(+WellbeingAssessment.created_at)  # oldest first — lag/rolling depend on this order
        .to_list()
    )

    if len(assessments) < MIN_HISTORY_WEEKS:
        return NotEligibleOut(
            student_id=student_id,
            checkins_count=len(assessments),
            checkins_needed=MIN_HISTORY_WEEKS,
        )

    return ForecastOut(**predict_from_real_history(student_id, assessments), student_name=student.full_name if student else None)
