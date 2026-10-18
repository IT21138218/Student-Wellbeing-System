"""Cohort report's pure arithmetic — no DB, matching this project's
established convention (see test_quiz_service.py's docstring): the
DB-touching half (build_cohort_report) isn't unit tested, but every pure
computation it delegates to is.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.services.report_service import _avg, _bucket_activity_by_day, _match_rate, _mode, _pct, _risk_distribution


# ---- _match_rate ----


def test_match_rate_is_none_with_no_feedback():
    """No feedback yet is a missing measurement, not a real 0% rate —
    the API must not imply "we checked and 0% matched"."""
    assert _match_rate(0, 0) is None


def test_match_rate_all_matched():
    assert _match_rate(4, 4) == 100.0


def test_match_rate_none_matched():
    assert _match_rate(4, 0) == 0.0


def test_match_rate_partial_is_rounded_to_one_decimal():
    assert _match_rate(3, 1) == pytest.approx(33.3)


# ---- _risk_distribution ----


def test_risk_distribution_counts_and_percentages():
    labels = ["LOW", "LOW", "MEDIUM", "HIGH", "HIGH", "HIGH", "HIGH"]
    dist = _risk_distribution(labels)
    by_label = {d.label: d for d in dist}
    assert by_label["LOW"].count == 2
    assert by_label["MEDIUM"].count == 1
    assert by_label["HIGH"].count == 4
    assert by_label["HIGH"].pct == pytest.approx(4 / 7 * 100, abs=0.1)
    assert sum(d.count for d in dist) == len(labels)


def test_risk_distribution_always_reports_all_three_labels():
    """Even a label with zero occurrences must appear (count=0), so a
    frontend chart never silently drops a slice."""
    dist = _risk_distribution(["LOW", "LOW"])
    labels_present = {d.label for d in dist}
    assert labels_present == {"LOW", "MEDIUM", "HIGH"}
    assert next(d for d in dist if d.label == "HIGH").count == 0


def test_risk_distribution_empty_list_has_zero_pct_not_a_crash():
    dist = _risk_distribution([])
    assert all(d.count == 0 and d.pct == 0.0 for d in dist)


# ---- _bucket_activity_by_day ----


def test_bucket_activity_covers_every_day_in_the_window_including_zero_days():
    now = datetime.now(timezone.utc)
    timestamps = [now, now - timedelta(days=2)]
    points = _bucket_activity_by_day(timestamps, days=5)
    assert len(points) == 5
    assert sum(p.count for p in points) == 2
    # Oldest first — the day-4-ago point comes before today's.
    assert points[0].date < points[-1].date


def test_bucket_activity_multiple_events_same_day_are_summed():
    now = datetime.now(timezone.utc)
    timestamps = [now, now, now]
    points = _bucket_activity_by_day(timestamps, days=1)
    assert len(points) == 1
    assert points[0].count == 3


def test_bucket_activity_no_events_is_all_zeros_not_an_empty_list():
    points = _bucket_activity_by_day([], days=3)
    assert len(points) == 3
    assert all(p.count == 0 for p in points)


# ---- _mode ----


def test_mode_returns_most_common_value():
    assert _mode(["A", "B", "A", "A", "C"]) == "A"


def test_mode_empty_list_is_none_not_an_index_error():
    assert _mode([]) is None


def test_mode_single_item():
    assert _mode(["Only"]) == "Only"


# ---- _avg ----


def test_avg_rounds_to_one_decimal():
    assert _avg([1, 2, 4]) == pytest.approx(2.3)


def test_avg_empty_list_is_none_not_zero():
    """No data yet is a missing measurement, not a real 0.0 average —
    matches this file's existing None-means-no-data convention."""
    assert _avg([]) is None


# ---- _pct ----


def test_pct_basic():
    assert _pct(1, 4) == 25.0


def test_pct_zero_total_is_zero_not_a_crash():
    assert _pct(0, 0) == 0.0
