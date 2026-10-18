"""Coping Recommendation's low_confidence flag — pure-function tests, no
model/artifact load, matching test_student_access.py's style.

compute_low_confidence() flags a recommendation when either the predicted
effectiveness class or the top-strategy pick isn't clearly ahead of its
runner-up — both derived from softmaxed SVM margins (not calibrated
probabilities, see ml/coping_recommendation/model.py's docstring).
"""

import pytest

from ml.coping_recommendation.model import (
    EFFECTIVENESS_MARGIN_THRESHOLD,
    RECOMMENDATION_MARGIN_THRESHOLD,
    compute_low_confidence,
)


def test_clear_effectiveness_winner_and_clear_recommendation_is_confident():
    # Effectiveness: class 2 clearly ahead. Recommendation: top strategy
    # clearly ahead of runner-up.
    assert compute_low_confidence([0.05, 0.10, 0.85], [0.80, 0.30, 0.20]) is False


def test_close_effectiveness_race_is_low_confidence():
    # Top two effectiveness classes nearly tied, even though the
    # recommendation margin is wide.
    assert compute_low_confidence([0.10, 0.44, 0.46], [0.80, 0.20, 0.10]) is True


def test_close_recommendation_race_is_low_confidence():
    # Effectiveness is a clear win, but the top two strategies are nearly tied.
    assert compute_low_confidence([0.05, 0.10, 0.85], [0.55, 0.52, 0.10]) is True


def test_both_margins_thin_is_low_confidence():
    assert compute_low_confidence([0.30, 0.34, 0.36], [0.45, 0.44, 0.11]) is True


@pytest.mark.parametrize("margin,expected", [
    (EFFECTIVENESS_MARGIN_THRESHOLD + 0.01, False),  # just above the threshold — confident
    (EFFECTIVENESS_MARGIN_THRESHOLD - 0.01, True),   # just below — low confidence
])
def test_effectiveness_margin_boundary(margin, expected):
    top = 0.5
    second = top - margin
    probs = [1 - top - second, second, top]
    assert compute_low_confidence(probs, [0.9, 0.1]) is expected


@pytest.mark.parametrize("margin,expected", [
    (RECOMMENDATION_MARGIN_THRESHOLD + 0.01, False),
    (RECOMMENDATION_MARGIN_THRESHOLD - 0.01, True),
])
def test_recommendation_margin_boundary(margin, expected):
    top = 0.6
    second = top - margin
    assert compute_low_confidence([0.05, 0.05, 0.9], [top, second, 0.1]) is expected


def test_single_candidate_lists_are_always_confident():
    """No runner-up to be close to — margin defaults to the max (1.0)."""
    assert compute_low_confidence([1.0], [1.0]) is False
