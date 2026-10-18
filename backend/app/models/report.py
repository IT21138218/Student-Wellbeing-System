from datetime import datetime

from pydantic import BaseModel

from app.models.overview import RiskSlice, RoleCount


class ModuleTotals(BaseModel):
    risk_assessments: int
    wellbeing_checkins: int
    coping_recommendations: int
    social_detections: int
    quiz_attempts: int


class ActivityPoint(BaseModel):
    date: str  # ISO date (YYYY-MM-DD), one point per day
    count: int  # documents of any of the 5 real modules created that day


class CopingEffectiveness(BaseModel):
    total_with_feedback: int
    matched_count: int
    # None (not 0.0) when total_with_feedback == 0 — no feedback yet isn't
    # the same claim as "0% of predictions were right".
    match_rate: float | None


class EscalationItem(BaseModel):
    risk_label: str
    escalated_at: datetime
    note: str | None


class SummaryHighlight(BaseModel):
    label: str
    value: str


class ModuleSummary(BaseModel):
    """One real, per-module rollup — same 5 modules as ModuleTotals, but with
    each module's own most meaningful breakdown instead of just its total
    run count. `highlights` is 1-3 short label/value pairs specific to that
    module (e.g. Wellbeing's avg composite score, Coping's most-recommended
    strategy) — deliberately not a fixed schema shared across modules, since
    "what's worth summarizing" genuinely differs per module."""

    key: str  # "risk" | "wellbeing" | "coping" | "social" | "quiz"
    label: str
    icon: str  # material-symbols name, matches the sidebar's icon for that module
    total: int
    highlights: list[SummaryHighlight]
    last_activity: datetime | None  # None when total == 0


class CohortReport(BaseModel):
    generated_at: datetime
    days: int  # the activity_over_time window that was requested

    totals: ModuleTotals
    registered_users: int
    registered_by_role: list[RoleCount]

    # Real risk_label distribution from actual RiskAssessment records — the
    # first place in the app showing this from live usage, not the CSV
    # cohort replay (Overview's risk_distribution stays CSV-only).
    risk_distribution: list[RiskSlice]

    escalated_count: int
    recent_escalations: list[EscalationItem]

    isolation_flagged_count: int
    isolation_detections_total: int

    coping_effectiveness: CopingEffectiveness

    # None when there are zero quiz attempts with a recorded score.
    avg_quiz_score: float | None

    activity_over_time: list[ActivityPoint]

    # Per-module rollup — "every part" summarized on its own, not just
    # totaled up. Same 5 modules as `totals`, in the order they're wired
    # into the sidebar.
    module_summaries: list[ModuleSummary]
