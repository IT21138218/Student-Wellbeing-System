from typing import Literal

from pydantic import BaseModel


class TrendPoint(BaseModel):
    week: int
    avg_score: float


class RiskSlice(BaseModel):
    label: Literal["LOW", "MEDIUM", "HIGH"]
    count: int
    pct: float


class AttentionStudent(BaseModel):
    student_id: str
    grade: int
    score: float
    risk_label: Literal["LOW", "MEDIUM", "HIGH"]


class ClassAverage(BaseModel):
    grade: int
    avg_score: float


class RoleCount(BaseModel):
    role: str
    count: int


class OverviewStats(BaseModel):
    # Research dataset (Member 1/student_wellbeing_dataset.csv) — fixed,
    # historical, 300 students. Never changes from app usage.
    total_students: int
    avg_wellbeing_score: float
    avg_wellbeing_delta: float  # vs previous week, cohort-wide
    high_risk_count: int
    high_risk_new_this_week: int
    current_week: int
    weekly_trend: list[TrendPoint]
    risk_distribution: list[RiskSlice]
    students_needing_attention: list[AttentionStudent]
    avg_score_by_class: list[ClassAverage]

    # Live app usage (MongoDB) — grows as people actually use this app.
    assessments_run: int  # real count of predictions made through this app
    registered_users: int  # total accounts ever registered
    registered_by_role: list[RoleCount]  # breakdown, e.g. how many are 'student'
