"""Dashboard overview stats — REAL numbers computed from the real
300-student / 8-week dataset (`Member 1/student_wellbeing_dataset.csv`),
same source as ml/wellbeing_forecasting, plus a live count of actual
predictions made through this app's own database (Risk, Wellbeing, Coping,
Social, and Quiz — every real Document model with a per-run record).

`total_students` = the 300-student CSV cohort PLUS any real signed-up
student accounts (role='student') — the two are additive since the CSV is
historical/simulated data, not app users.

Replaces what was previously an entirely hardcoded overview screen
(fake "1,240 students", made-up student names, static chart arrays).
"""

import asyncio
from functools import lru_cache
from pathlib import Path

import pandas as pd
from pydantic import BaseModel

from app.models.overview import AttentionStudent, ClassAverage, OverviewStats, RiskSlice, RoleCount, TrendPoint
from app.models.risk import RiskAssessment
from app.models.wellbeing import WellbeingAssessment
from app.models.coping import CopingRecord
from app.models.social import SocialRecord
from app.models.quiz import QuizAttempt
from app.models.user import User

# Shipped inside backend/ so a deploy of just this folder still has the data
# (e.g. Render). Falls back to the research copy for a full local checkout.
_BUNDLED = Path(__file__).parents[2] / "data" / "student_wellbeing_dataset.csv"
_RESEARCH = Path(__file__).parents[2] / ".." / "Member 1" / "student_wellbeing_dataset.csv"
DATASET_PATH = _BUNDLED if _BUNDLED.exists() else _RESEARCH


class _RoleOnly(BaseModel):
    """Projection for the registered-users tally below — a User document can
    carry an inline avatar up to 2MB (auth_service.MAX_AVATAR_BYTES); fetching
    full documents just to count roles pulled that payload over the network
    for every single caller of this PUBLIC, unauthenticated, 30s-auto-
    refreshing endpoint. Confirmed live: full User.find_all().to_list() took
    ~12s for 16 real users; this projection needs only `role`."""

    role: str


@lru_cache
def _load_dataset() -> pd.DataFrame:
    path = DATASET_PATH.resolve()
    if not path.exists():
        raise FileNotFoundError(f"Real dataset not found at {path}.")
    return pd.read_csv(path)


async def get_overview_stats() -> OverviewStats:
    df = _load_dataset()
    current_week = int(df["week"].max())
    previous_week = current_week - 1

    latest = df[df["week"] == current_week]
    prior = df[df["week"] == previous_week]

    avg_now = float(latest["composite_wellbeing_score"].mean())
    avg_prior = float(prior["composite_wellbeing_score"].mean()) if not prior.empty else avg_now

    weekly_trend = [
        TrendPoint(week=int(w), avg_score=round(float(g["composite_wellbeing_score"].mean()), 1))
        for w, g in df.groupby("week")
    ]

    risk_counts = latest["risk_label"].value_counts()
    total = len(latest)
    risk_distribution = [
        RiskSlice(label=label, count=int(risk_counts.get(label, 0)), pct=round(int(risk_counts.get(label, 0)) / total * 100, 1))
        for label in ["LOW", "MEDIUM", "HIGH"]
    ]

    high_risk_count = int(risk_counts.get("HIGH", 0))
    # "New" high-risk this week: HIGH now but not HIGH last week, for the same student.
    prior_by_id = prior.set_index("student_id")["risk_label"] if not prior.empty else pd.Series(dtype=object)
    newly_high = 0
    for _, row in latest[latest["risk_label"] == "HIGH"].iterrows():
        if prior_by_id.get(row["student_id"]) != "HIGH":
            newly_high += 1

    attention = latest.nsmallest(6, "composite_wellbeing_score")
    students_needing_attention = [
        AttentionStudent(
            student_id=r.student_id, grade=int(r.grade),
            score=round(float(r.composite_wellbeing_score), 1), risk_label=r.risk_label,
        )
        for r in attention.itertuples()
    ]

    avg_by_grade = latest.groupby("grade")["composite_wellbeing_score"].mean().round(1)
    avg_score_by_class = [ClassAverage(grade=int(g), avg_score=float(v)) for g, v in avg_by_grade.items()]

    # Independent queries — run concurrently instead of one round trip each.
    counts, all_users = await asyncio.gather(
        asyncio.gather(*(m.find_all().count() for m in (
            RiskAssessment, WellbeingAssessment, CopingRecord, SocialRecord, QuizAttempt,
        ))),
        User.find_all().project(_RoleOnly).to_list(),
    )
    assessments_run = sum(counts)

    registered_users = len(all_users)
    role_counts: dict[str, int] = {}
    for u in all_users:
        role_counts[u.role] = role_counts.get(u.role, 0) + 1
    registered_by_role = [RoleCount(role=role, count=count) for role, count in sorted(role_counts.items())]

    # Total Students = the 300-student CSV cohort plus any real signed-up
    # student accounts (role='student') — the CSV is historical/simulated
    # data, not app users, so the two counts are additive, not overlapping.
    real_student_accounts = role_counts.get("student", 0)

    return OverviewStats(
        total_students=int(df["student_id"].nunique()) + real_student_accounts,
        avg_wellbeing_score=round(avg_now, 1),
        avg_wellbeing_delta=round(avg_now - avg_prior, 1),
        high_risk_count=high_risk_count,
        high_risk_new_this_week=newly_high,
        current_week=current_week,
        weekly_trend=weekly_trend,
        risk_distribution=risk_distribution,
        students_needing_attention=students_needing_attention,
        avg_score_by_class=avg_score_by_class,
        assessments_run=assessments_run,
        registered_users=registered_users,
        registered_by_role=registered_by_role,
    )
