from typing import Literal

from pydantic import BaseModel


class StudentSummary(BaseModel):
    student_id: str
    grade: int
    weeks_available: int
    risk_label: Literal["LOW", "MEDIUM", "HIGH"]


class TrajectoryPoint(BaseModel):
    week: int
    actual_score: float


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class ForecastEvalMetrics(BaseModel):
    mae: float
    rmse: float
    r_squared: float
    mase: float
    directional_accuracy: float


class ForecastOut(BaseModel):
    student_id: str
    # Set only on the real-student path (a registered account's full name) —
    # None for the CSV path, where student_id ("S001") is already the label
    # the UI shows. Lets the parent-facing summary read a real name instead
    # of a raw Mongo id — see routes/forecast.py's predict().
    student_name: str | None = None
    current_week: int
    current_score: float
    predicted_next_week_score: float
    delta: float
    trend: Literal["improving", "declining", "stable"]
    actual_next_week_score: float | None
    trajectory: list[TrajectoryPoint]
    weeks_of_history: int
    top_features: list[FeatureImportance]
    eval_metrics: ForecastEvalMetrics


# ---- Real-student path (source=real). The CSV path above is unchanged. ----


class RealStudentOption(BaseModel):
    """A registered student account and whether they have enough stored
    check-ins for the forecasting model to run on real data."""

    id: str
    full_name: str
    checkins_count: int
    eligible: bool


class NotEligibleOut(BaseModel):
    """Returned with HTTP 200 (not an error) when a real student exists but
    hasn't accumulated enough check-ins yet — the UI renders this as a
    progress state, not a failure."""

    eligible: Literal[False] = False
    student_id: str
    checkins_count: int
    checkins_needed: int
