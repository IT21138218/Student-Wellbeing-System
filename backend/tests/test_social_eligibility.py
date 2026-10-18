"""Social Isolation real-student eligibility and CSV-vs-real id routing —
pure-function tests, no DB, matching test_forecast_eligibility.py's style.
"""

import pytest
from beanie import PydanticObjectId

from app.models.social import RealSocialStudentOption, SocialNotEligibleOut
from app.services.social_service import is_real_student_id
from ml.social_peer_matching.real_features import MIN_HISTORY_WEEKS


def _option(count: int) -> RealSocialStudentOption:
    return RealSocialStudentOption(
        id=str(PydanticObjectId()), full_name="Test Student",
        checkins_count=count, eligible=count >= MIN_HISTORY_WEEKS,
    )


@pytest.mark.parametrize("count,expected", [
    (0, False),
    (1, False),  # one short of the 2-check-in minimum — the boundary that matters
    (2, True),   # exactly the minimum
    (3, True),
])
def test_eligibility_is_at_least_two_checkins(count, expected):
    assert _option(count).eligible is expected


def test_not_eligible_out_always_reports_eligible_false():
    out = SocialNotEligibleOut(student_id="x", checkins_count=1, checkins_needed=2)
    assert out.eligible is False
    with pytest.raises(ValueError):
        SocialNotEligibleOut(student_id="x", checkins_count=5, checkins_needed=2, eligible=True)


def test_csv_cohort_ids_route_to_the_unchanged_csv_path():
    for csv_id in ("S001", "S150", "S300"):
        assert is_real_student_id(csv_id) is False


def test_mongo_object_ids_route_to_the_real_student_path():
    assert is_real_student_id(str(PydanticObjectId())) is True


def test_malformed_ids_are_not_treated_as_real_students():
    for bad in ("", "not-an-id", "12345"):
        assert is_real_student_id(bad) is False
