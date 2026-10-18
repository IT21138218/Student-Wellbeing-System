"""Real-student forecast feature building, checked against hand-computed
values — not just "looks reasonable".

Pure-function tests, no DB, matching test_student_access.py's style: the
WellbeingAssessment documents are stand-ins built without Beanie/Mongo,
since assessments_to_frame() only reads .composite_wellbeing_score and
.features off them.
"""

import numpy as np
import pytest
from scipy import stats

from ml.wellbeing_forecasting.features import ALL_FEATURES
from ml.wellbeing_forecasting.real_features import (
    MIN_HISTORY_WEEKS,
    assessments_to_frame,
    build_real_forecast_features,
)

# The 18 base columns that aren't time-engineered — held constant across all
# records here so the engineered columns are the only thing under test.
_CONSTANT_FEATURES = {
    "grade": 10, "study_hours": 3.0, "homework_completion_rate": 0.7,
    "absence_count": 1, "anxiety_level": 3.0, "sleep_hours": 7.0, "fatigue_level": 3.0,
    "motivation_level": 3.0, "confidence_level": 3.0, "peer_interaction": 3.0,
    "teacher_support": 3.0, "class_participation": 3.0, "teacher_engagement_score": 3.0,
    "behavior_rating": 4.0, "academic_stress_index": 0.35,
    "attendance_stability_index": 0.95, "performance_trend_index": 0.0, "behavioral_score": 0.75,
}


class _Assessment:
    """Minimal stand-in for a WellbeingAssessment document."""

    def __init__(self, cws, exam, stress, attendance, form_week=99):
        self.composite_wellbeing_score = cws
        self.features = {
            **_CONSTANT_FEATURES,
            "avg_exam_score": exam,
            "stress_level": stress,
            "attendance_rate": attendance,
            # Deliberately a nonsense constant: the form's own `week` field must
            # be ignored in favour of the sequence position.
            "week": form_week,
        }


def _history(cws, exam, stress, attendance):
    return [_Assessment(*t) for t in zip(cws, exam, stress, attendance)]


# Shared 3-record fixture, with hand-computed expectations below.
CWS = [60.0, 65.0, 72.0]
EXAM = [50.0, 55.0, 61.0]
STRESS = [7.0, 6.0, 4.0]
ATTENDANCE = [80.0, 85.0, 92.0]


def _ewm_adjusted(values, alpha=0.3):
    """pandas .ewm(alpha=..) defaults to adjust=True — a weighted average,
    NOT the recursive form. Computing it independently here so the test
    doesn't just re-run pandas and agree with itself."""
    weights = [(1 - alpha) ** (len(values) - 1 - i) for i in range(len(values))]
    return sum(w * v for w, v in zip(weights, values)) / sum(weights)


@pytest.fixture
def latest_row():
    return build_real_forecast_features(_history(CWS, EXAM, STRESS, ATTENDANCE)).iloc[0]


@pytest.mark.parametrize("feature,expected", [
    ("composite_wellbeing_score_lag1", 65.0),
    ("composite_wellbeing_score_lag2", 60.0),
    ("avg_exam_score_lag1", 55.0),
    ("avg_exam_score_lag2", 50.0),
    ("stress_level_lag1", 6.0),
    ("stress_level_lag2", 7.0),
    ("attendance_rate_lag1", 85.0),
    ("attendance_rate_lag2", 80.0),
    ("composite_wellbeing_score_rolling_mean3", (60 + 65 + 72) / 3),
    ("composite_wellbeing_score_rolling_std3", float(np.std([60, 65, 72], ddof=1))),
    ("stress_level_rolling_mean3", (7 + 6 + 4) / 3),
    ("stress_level_rolling_std3", float(np.std([7, 6, 4], ddof=1))),
    ("score_delta", 61.0 - 55.0),
    ("stress_delta", 4.0 - 6.0),
    ("wellbeing_delta", 72.0 - 65.0),
    ("momentum", 65.0 - 60.0),
    ("cumulative_stress_3w", 7 + 6 + 4),
    ("attendance_trend", float(stats.linregress(np.arange(3), [80, 85, 92]).slope)),
    ("wellbeing_ema", _ewm_adjusted([60.0, 65.0, 72.0])),
])
def test_engineered_feature_matches_hand_computed_value(latest_row, feature, expected):
    assert float(latest_row[feature]) == pytest.approx(expected, abs=1e-9)


def test_feature_vector_matches_the_fitted_artifacts_column_contract():
    """42 columns in ALL_FEATURES' exact order — what real_scaler.pkl was fit
    on. A mismatch here means the scaler would silently misalign columns."""
    row = build_real_forecast_features(_history(CWS, EXAM, STRESS, ATTENDANCE))
    assert list(row.columns) == ALL_FEATURES
    assert len(row.columns) == 42


def test_week_is_the_sequence_position_not_the_forms_own_week_field():
    """The notebook sorts by an integer week per student and never looks at
    real dates. The form's `week` (99 in the fixture) must be overwritten by
    the check-in's position in the student's history."""
    frame = assessments_to_frame(_history(CWS, EXAM, STRESS, ATTENDANCE))
    assert list(frame["week"]) == [1, 2, 3]


def test_non_engineered_base_columns_pass_through_from_the_latest_checkin():
    row = build_real_forecast_features(_history(CWS, EXAM, STRESS, ATTENDANCE)).iloc[0]
    assert float(row["grade"]) == 10
    assert float(row["sleep_hours"]) == 7.0
    assert float(row["composite_wellbeing_score"]) == 72.0  # latest, not an average


# ---- The fillna(0) edge case at exactly 2 vs exactly 3 records ----


def test_two_records_is_below_the_minimum_and_is_refused():
    """With 2 records, lag2/momentum would be zero-filled by the pipeline's
    trailing fillna(0) — a prediction built on fabricated zeros with no
    error raised. That's precisely what MIN_HISTORY_WEEKS guards."""
    with pytest.raises(ValueError, match="at least 3 check-ins"):
        build_real_forecast_features(_history(CWS[:2], EXAM[:2], STRESS[:2], ATTENDANCE[:2]))


def test_three_records_is_exactly_the_minimum_and_is_accepted():
    row = build_real_forecast_features(_history(CWS, EXAM, STRESS, ATTENDANCE))
    assert len(row) == 1


def test_at_exactly_three_records_no_engineered_feature_is_a_zero_fill_artifact():
    """The point of the 3-record floor: every look-back feature has real data
    behind it. lag2 and momentum are the deepest, so if those are genuine,
    nothing was silently zero-filled."""
    row = build_real_forecast_features(_history(CWS, EXAM, STRESS, ATTENDANCE)).iloc[0]
    assert float(row["composite_wellbeing_score_lag2"]) == 60.0  # not 0.0
    assert float(row["momentum"]) == 5.0                          # not 0.0
    assert float(row["attendance_trend"]) != 0.0                  # real slope, not the i<window-1 zero


def test_min_history_weeks_is_three():
    """Guards against this being lowered — see the module docstring on why
    fillna(0) makes a lower floor silently wrong rather than loudly broken."""
    assert MIN_HISTORY_WEEKS == 3
