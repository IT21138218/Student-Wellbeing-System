"""Forecast eligibility: how many stored check-ins a real student needs
before the model may run on their history.

Pure-function tests, no DB — the count -> eligible rule and the CSV-vs-real
id routing are both decidable without Mongo, same approach as
test_student_access.py.
"""

import pytest
from beanie import PydanticObjectId

from app.models.forecast import NotEligibleOut, RealStudentOption
from app.services.forecast_service import is_real_student_id
from ml.wellbeing_forecasting.real_features import MIN_HISTORY_WEEKS


def _option(count: int) -> RealStudentOption:
    """Mirrors exactly what list_forecast_eligible_students builds per student."""
    return RealStudentOption(
        id=str(PydanticObjectId()),
        full_name="Test Student",
        checkins_count=count,
        eligible=count >= MIN_HISTORY_WEEKS,
    )


@pytest.mark.parametrize("count,expected", [
    (0, False),
    (1, False),
    (2, False),   # one short — the boundary that matters
    (3, True),    # exactly the minimum
    (4, True),
    (12, True),
])
def test_eligibility_is_at_least_three_checkins(count, expected):
    assert _option(count).eligible is expected


def test_checkins_needed_is_reported_for_each_ineligible_count():
    """The UI renders "N of 3 check-ins" from this, so the count must be the
    student's real total and needed must be the floor, not a remainder."""
    for count in (0, 1, 2):
        out = NotEligibleOut(
            student_id=str(PydanticObjectId()), checkins_count=count, checkins_needed=MIN_HISTORY_WEEKS,
        )
        assert out.eligible is False
        assert out.checkins_count == count
        assert out.checkins_needed == 3


def test_not_eligible_out_always_reports_eligible_false():
    """eligible is a Literal[False] — it can't be constructed claiming
    otherwise, so the frontend's `if (!data.eligible)` branch is safe."""
    out = NotEligibleOut(student_id="x", checkins_count=2, checkins_needed=3)
    assert out.eligible is False
    with pytest.raises(ValueError):
        NotEligibleOut(student_id="x", checkins_count=5, checkins_needed=3, eligible=True)


# ---- id routing: which path a given student_id takes ----


def test_csv_cohort_ids_route_to_the_unchanged_csv_path():
    for csv_id in ("S001", "S150", "S300"):
        assert is_real_student_id(csv_id) is False


def test_mongo_object_ids_route_to_the_real_student_path():
    assert is_real_student_id(str(PydanticObjectId())) is True


def test_malformed_ids_are_not_treated_as_real_students():
    """Anything unparseable falls through to the CSV path, which 404s on an
    unknown id — rather than being mistaken for an account lookup."""
    for bad in ("", "not-an-id", "12345", "S001-extra"):
        assert is_real_student_id(bad) is False
