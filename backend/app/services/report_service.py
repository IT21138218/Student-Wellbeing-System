"""Cohort-wide report: real counts and trends aggregated across all 5 real
Document models (Risk, Wellbeing, Coping, Social, Quiz) — no CSV cohort
data involved here at all, unlike Overview. This is the first place in the
app that reports risk distribution, escalations, isolation flags, and
coping outcomes from ACTUAL app usage rather than the training-cohort replay.
"""

import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel

from app.models.coping import CopingRecord
from app.models.overview import RiskSlice, RoleCount
from app.models.quiz import QuizAttempt
from app.models.report import (
    ActivityPoint,
    CohortReport,
    CopingEffectiveness,
    EscalationItem,
    ModuleSummary,
    ModuleTotals,
    SummaryHighlight,
)
from app.models.risk import RiskAssessment
from app.models.social import SocialRecord
from app.models.user import User
from app.models.wellbeing import WellbeingAssessment

_MAX_RECENT_ESCALATIONS = 10


class _RoleOnly(BaseModel):
    """Same fix as overview_service.py's identical projection: a User
    document can carry an inline avatar up to 2MB (auth_service.
    MAX_AVATAR_BYTES), so fetching full documents just to count roles pulls
    that payload over the network for nothing. Confirmed live: full
    User.find_all().to_list() took ~7.2s of this report's ~11.2s total for
    16 real users; this projection needs only `role`."""

    role: str


def _match_rate(total_with_feedback: int, matched_count: int) -> float | None:
    """Pure — no Mongo access — so it's unit-testable directly. None (not
    0.0) with no feedback yet: that's a missing measurement, not a real 0%."""
    if total_with_feedback == 0:
        return None
    return round(matched_count / total_with_feedback * 100, 1)


def _risk_distribution(labels: list[str]) -> list[RiskSlice]:
    """Pure — bucket a list of risk_label strings into the same
    LOW/MEDIUM/HIGH RiskSlice shape Overview already uses for the CSV
    cohort, just fed from real data here."""
    counts = Counter(labels)
    total = len(labels)
    return [
        RiskSlice(
            label=label,
            count=counts.get(label, 0),
            pct=round(counts.get(label, 0) / total * 100, 1) if total else 0.0,
        )
        for label in ["LOW", "MEDIUM", "HIGH"]
    ]


def _mode(items: list[str]) -> str | None:
    """Pure — the most common string in the list, or None for an empty list
    (no activity yet, not a fabricated "most common" of nothing). A tie
    resolves to whichever value Counter first saw, same as Counter's own
    documented behavior — good enough for a summary highlight, not a
    guarantee that matters here."""
    if not items:
        return None
    return Counter(items).most_common(1)[0][0]


def _avg(nums: list[float]) -> float | None:
    """Pure — mean of a list of numbers rounded to 1dp; None (not 0.0) when
    the list is empty, matching this file's existing None-means-no-data
    convention (see _match_rate)."""
    return round(sum(nums) / len(nums), 1) if nums else None


def _pct(count: int, total: int) -> float:
    """Pure — what % of `total` is `count`; 0.0 (not a divide-by-zero) when
    total is 0. Unlike _match_rate, 0% of zero activity is a fine thing to
    show next to a total of 0 — it's the total itself, right beside it, that
    already communicates "no data yet"."""
    return round(count / total * 100, 1) if total else 0.0


def _bucket_activity_by_day(timestamps: list[datetime], days: int) -> list[ActivityPoint]:
    """Pure — timestamps already filtered to the window by the caller.
    Produces one ActivityPoint per day in the window, oldest first,
    including days with zero activity (so a line chart doesn't skip gaps)."""
    today = datetime.now(timezone.utc).date()
    counts = Counter(ts.date() for ts in timestamps)
    return [
        ActivityPoint(date=(today - timedelta(days=offset)).isoformat(), count=counts.get(today - timedelta(days=offset), 0))
        for offset in range(days - 1, -1, -1)
    ]


async def build_cohort_report(days: int = 30) -> CohortReport:
    # Each module's full record set, fetched once and reused below both for
    # the existing aggregate metrics and the new per-module summaries —
    # avoids the previous code's repeat queries against the same collection
    # (e.g. RiskAssessment was queried 3 separate times for count/labels/
    # escalations). Real usage today is dozens of records per collection, so
    # "fetch once, derive everything in Python" is both simpler and cheaper
    # than round-tripping Mongo per metric.
    (risk_records, wellbeing_records, coping_records, social_records, quiz_records, all_users) = (
        await asyncio.gather(
            RiskAssessment.find_all().to_list(),
            WellbeingAssessment.find_all().to_list(),
            CopingRecord.find_all().to_list(),
            SocialRecord.find_all().to_list(),
            QuizAttempt.find_all().to_list(),
            User.find_all().project(_RoleOnly).to_list(),
        )
    )

    totals = ModuleTotals(
        risk_assessments=len(risk_records),
        wellbeing_checkins=len(wellbeing_records),
        coping_recommendations=len(coping_records),
        social_detections=len(social_records),
        quiz_attempts=len(quiz_records),
    )

    registered_users = len(all_users)
    role_counts: dict[str, int] = {}
    for u in all_users:
        role_counts[u.role] = role_counts.get(u.role, 0) + 1
    registered_by_role = [RoleCount(role=role, count=count) for role, count in sorted(role_counts.items())]

    risk_labels = [r.risk_label for r in risk_records]
    risk_distribution = _risk_distribution(risk_labels)

    escalated_records_all = [r for r in risk_records if r.escalated]
    escalated_count = len(escalated_records_all)
    recent_escalations = [
        EscalationItem(risk_label=r.risk_label, escalated_at=r.escalated_at, note=r.escalated_note)
        for r in sorted(escalated_records_all, key=lambda r: r.escalated_at, reverse=True)[:_MAX_RECENT_ESCALATIONS]
    ]

    isolation_flagged_records = [r for r in social_records if r.isolation_risk_flag]
    isolation_flagged_count = len(isolation_flagged_records)
    isolation_detections_total = len(social_records)

    coping_with_feedback = [r for r in coping_records if r.actual_effectiveness is not None]
    matched_count = sum(1 for r in coping_with_feedback if r.actual_effectiveness == r.selected_effectiveness)
    coping_effectiveness = CopingEffectiveness(
        total_with_feedback=len(coping_with_feedback),
        matched_count=matched_count,
        match_rate=_match_rate(len(coping_with_feedback), matched_count),
    )

    quiz_scores = [a.score for a in quiz_records if a.score is not None]
    avg_quiz_score = _avg(quiz_scores)

    # Deliberately a fresh Mongo query per model here (not a Python-side
    # filter of the full lists already fetched above): every created_at
    # this app writes comes back from Motor as an offset-NAIVE UTC datetime
    # (confirmed live — 100% naive across all 5 collections), even though
    # the field's own default_factory produces an offset-AWARE value at
    # insert time; Mongo strips the tzinfo on the round trip. Comparing that
    # naive value against a Python-side aware `cutoff` raises
    # "can't compare offset-naive and offset-aware datetimes" — letting
    # Mongo's own BSON-level comparison do the `>=` instead sidesteps the
    # mismatch entirely, same as this line worked before this function was
    # restructured to reuse the full lists for everything else.
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    activity_timestamps: list[datetime] = []
    recent = await asyncio.gather(*(
        model.find(model.created_at >= cutoff).to_list()
        for model in (RiskAssessment, WellbeingAssessment, CopingRecord, SocialRecord, QuizAttempt)
    ))
    for records in recent:
        activity_timestamps.extend(r.created_at for r in records)
    activity_over_time = _bucket_activity_by_day(activity_timestamps, days)

    high_risk_wellbeing = [r for r in wellbeing_records if r.risk_label == "HIGH"]
    module_summaries = [
        ModuleSummary(
            key="risk", label="Risk Classification", icon="analytics",
            total=len(risk_records),
            highlights=[
                SummaryHighlight(label="HIGH risk", value=f"{sum(1 for r in risk_records if r.risk_label == 'HIGH')} ({_pct(sum(1 for r in risk_records if r.risk_label == 'HIGH'), len(risk_records))}%)"),
                SummaryHighlight(label="Escalated", value=str(escalated_count)),
            ],
            last_activity=max((r.created_at for r in risk_records), default=None),
        ),
        ModuleSummary(
            key="wellbeing", label="Wellbeing Indicator", icon="health_metrics",
            total=len(wellbeing_records),
            highlights=[
                SummaryHighlight(label="Avg composite score", value=f"{_avg([r.composite_wellbeing_score for r in wellbeing_records])}" if wellbeing_records else "—"),
                SummaryHighlight(label="HIGH risk check-ins", value=f"{len(high_risk_wellbeing)} ({_pct(len(high_risk_wellbeing), len(wellbeing_records))}%)"),
            ],
            last_activity=max((r.created_at for r in wellbeing_records), default=None),
        ),
        ModuleSummary(
            key="coping", label="Coping Strategies", icon="self_improvement",
            total=len(coping_records),
            highlights=[
                SummaryHighlight(label="Most recommended", value=_mode([r.top_recommendation for r in coping_records]) or "—"),
                SummaryHighlight(
                    label="Feedback match rate",
                    value=f"{coping_effectiveness.match_rate}%" if coping_effectiveness.match_rate is not None else "No feedback yet",
                ),
            ],
            last_activity=max((r.created_at for r in coping_records), default=None),
        ),
        ModuleSummary(
            key="social", label="Social Isolation", icon="group",
            total=len(social_records),
            highlights=[
                SummaryHighlight(label="Isolation-flagged", value=f"{isolation_flagged_count} ({_pct(isolation_flagged_count, isolation_detections_total)}%)"),
                SummaryHighlight(label="Most common cluster", value=_mode([r.cluster_name for r in social_records]) or "—"),
            ],
            last_activity=max((r.created_at for r in social_records), default=None),
        ),
        ModuleSummary(
            key="quiz", label="Adaptive Quiz", icon="quiz",
            total=len(quiz_records),
            highlights=[
                SummaryHighlight(label="Avg score", value=f"{avg_quiz_score}%" if avg_quiz_score is not None else "—"),
                SummaryHighlight(label="Most common difficulty", value=_mode([a.difficulty for a in quiz_records]) or "—"),
            ],
            last_activity=max((r.created_at for r in quiz_records), default=None),
        ),
    ]

    return CohortReport(
        generated_at=datetime.now(timezone.utc),
        days=days,
        totals=totals,
        registered_users=registered_users,
        registered_by_role=registered_by_role,
        risk_distribution=risk_distribution,
        escalated_count=escalated_count,
        recent_escalations=recent_escalations,
        isolation_flagged_count=isolation_flagged_count,
        isolation_detections_total=isolation_detections_total,
        coping_effectiveness=coping_effectiveness,
        avg_quiz_score=avg_quiz_score,
        activity_over_time=activity_over_time,
        module_summaries=module_summaries,
    )
