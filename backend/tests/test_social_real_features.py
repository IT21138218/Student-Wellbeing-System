"""Real-student Social Isolation feature building, checked against
hand-computed values — not just "looks reasonable".

Pure-function tests, no DB — mirrors test_forecast_features.py's style.
CopingRecord stand-ins are built without Beanie/Mongo since
build_real_social_profile() only reads .features off each record.
"""

import numpy as np
import pytest

from ml.social_peer_matching.features import CLUSTER_FEATURES
from ml.social_peer_matching.real_features import (
    MIN_HISTORY_WEEKS,
    build_real_social_profile,
    compute_loneliness_trend,
)


class _Record:
    def __init__(self, **features):
        self.features = features


# Shared 3-record fixture, hand-computed expectations below.
BELONGING = [2.0, 3.0, 4.0]
LONELINESS = [4.0, 3.0, 2.0]
HELP_SEEKING = [2.0, 3.0, 4.0]
GROUP_INCLUSION = [2.0, 3.0, 4.0]
HAS_SUPPORT = [0, 1, 1]
TALKS = [0, 1, 1]
CLASS_SUPPORT = [2.0, 3.0, 4.0]
CLASS_COMPETITION = [3.0, 2.0, 2.0]
PEER_HELPING = [2.0, 3.0, 4.0]


def _records():
    return [
        _Record(
            belonging_score=BELONGING[i], loneliness_score=LONELINESS[i],
            help_seeking_comfort=HELP_SEEKING[i], group_inclusion=GROUP_INCLUSION[i],
            has_support_person=HAS_SUPPORT[i], talks_to_someone=TALKS[i],
            class_support=CLASS_SUPPORT[i], class_competition=CLASS_COMPETITION[i],
            peer_helping=PEER_HELPING[i],
        )
        for i in range(3)
    ]


@pytest.fixture
def profile():
    return build_real_social_profile(_records())


@pytest.mark.parametrize("feature,expected", [
    ("belonging_score_mean", np.mean(BELONGING)),
    ("loneliness_score_mean", np.mean(LONELINESS)),
    ("help_seeking_comfort_mean", np.mean(HELP_SEEKING)),
    ("group_inclusion_mean", np.mean(GROUP_INCLUSION)),
    ("has_support_person_mean", np.mean(HAS_SUPPORT)),
    ("talks_to_someone_mean", np.mean(TALKS)),
    ("class_support_mean", np.mean(CLASS_SUPPORT)),
    ("peer_helping_mean", np.mean(PEER_HELPING)),
    ("social_perception_score", (np.mean(BELONGING) + np.mean(GROUP_INCLUSION) + np.mean(HELP_SEEKING) - np.mean(LONELINESS)) / 4),
    ("isolation_index", (5 - np.mean(BELONGING)) + np.mean(LONELINESS) + (5 - np.mean(GROUP_INCLUSION))),
    ("support_availability", np.mean(HAS_SUPPORT) + np.mean(TALKS)),
    ("class_environment", np.mean(CLASS_SUPPORT) + np.mean(PEER_HELPING) - np.mean(CLASS_COMPETITION)),
    ("social_stability", np.std(BELONGING, ddof=1) + np.std(LONELINESS, ddof=1)),
    ("loneliness_trend", np.polyfit(np.arange(3), LONELINESS, 1)[0]),
])
def test_engineered_feature_matches_hand_computed_value(profile, feature, expected):
    assert profile[feature] == pytest.approx(expected, abs=1e-9)


def test_feature_vector_matches_the_fitted_artifacts_column_contract():
    """14 columns in CLUSTER_FEATURES' exact order — what real_scaler.pkl
    was fit on. A mismatch here means the scaler would silently misalign
    columns."""
    profile = build_real_social_profile(_records())
    keys = [k for k in profile if k != "survey_count"]
    assert keys == CLUSTER_FEATURES
    assert len(keys) == 14


def test_survey_count_matches_record_count():
    assert build_real_social_profile(_records())["survey_count"] == 3


# ---- Loneliness trend edge cases ----


def test_loneliness_trend_zero_with_fewer_than_two_records():
    assert compute_loneliness_trend([{"loneliness_score": 3.0}]) == 0.0
    assert compute_loneliness_trend([]) == 0.0


def test_loneliness_trend_rising_is_positive_slope():
    feats = [{"loneliness_score": v} for v in [1.0, 2.0, 3.0, 4.0]]
    assert compute_loneliness_trend(feats) == pytest.approx(1.0)


def test_loneliness_trend_falling_is_negative_slope():
    feats = [{"loneliness_score": v} for v in [4.0, 3.0, 2.0, 1.0]]
    assert compute_loneliness_trend(feats) == pytest.approx(-1.0)


# ---- Minimum-history gate ----


def test_below_minimum_is_refused():
    with pytest.raises(ValueError, match="at least 2 check-ins"):
        build_real_social_profile(_records()[:1])


def test_at_minimum_is_accepted():
    profile = build_real_social_profile(_records()[:2])
    assert profile["survey_count"] == 2


def test_min_history_weeks_is_two():
    """Guards against this being lowered without a deliberate decision —
    below it, social_stability's std is degenerate and loneliness_trend
    can't reflect a real direction."""
    assert MIN_HISTORY_WEEKS == 2
