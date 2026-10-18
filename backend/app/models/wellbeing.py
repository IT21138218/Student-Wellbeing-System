from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class WellbeingFeaturesIn(BaseModel):
    """Matches the 22 raw columns Member 1's real trained model expects —
    see ml/wellbeing_indicator/features.py. Ranges reflect what's actually
    observed in student_wellbeing_dataset.csv, padded slightly for headroom."""

    grade: int = Field(..., ge=6, le=12)
    week: int = Field(..., ge=1, le=12)
    avg_exam_score: float = Field(..., ge=0, le=100)
    study_hours: float = Field(..., ge=0, le=10)
    homework_completion_rate: float = Field(..., ge=0, le=1)
    attendance_rate: float = Field(..., ge=0, le=100)
    absence_count: int = Field(..., ge=0, le=15)
    stress_level: float = Field(..., ge=1, le=10)
    anxiety_level: float = Field(..., ge=1, le=10)
    sleep_hours: float = Field(..., ge=2, le=12)
    fatigue_level: float = Field(..., ge=1, le=10)
    motivation_level: float = Field(..., ge=1, le=5)
    confidence_level: float = Field(..., ge=1, le=5)
    peer_interaction: float = Field(..., ge=1, le=5)
    teacher_support: float = Field(..., ge=1, le=5)
    class_participation: float = Field(..., ge=1, le=5)
    teacher_engagement_score: float = Field(..., ge=1, le=5)
    behavior_rating: float = Field(..., ge=1, le=5)
    academic_stress_index: float = Field(..., ge=0, le=1)
    attendance_stability_index: float = Field(..., ge=0, le=1)
    performance_trend_index: float = Field(..., ge=-1, le=1)
    behavioral_score: float = Field(..., ge=0, le=1)

    student_id: str | None = None


class WellbeingFeatureContribution(BaseModel):
    feature: str
    importance: float
    direction: Literal["positive", "negative"]


class WellbeingEvalMetrics(BaseModel):
    mae: float
    rmse: float
    r_squared: float
    mape: float


class WellbeingRecommendation(BaseModel):
    icon: str
    title: str
    text: str
    priority: Literal["low", "medium", "high"]


class WellbeingPredictionOut(BaseModel):
    composite_wellbeing_score: float
    risk_label: Literal["LOW", "MEDIUM", "HIGH"]
    score_narrative: str
    dimensions: dict[str, float]
    eval_metrics: WellbeingEvalMetrics
    top_features: list[WellbeingFeatureContribution]
    recommendations: list[WellbeingRecommendation]


class WellbeingAssessment(Document):
    # The Mongo _id (as a string) of the registered student User this check-in
    # is filed under, or None for an untagged general check-in. NOT a CSV
    # "S001" ID: Forecasting and Social Peer Matching use those because their
    # models read stored per-student weekly history, whereas this module takes
    # all 22 features by hand, so the reference is only a label.
    student_id: str | None = None
    # Denormalized at write time so history stays readable even if the student
    # account is later deleted.
    student_name: str | None = None
    user_id: PydanticObjectId | None = None  # the logged-in account that ran this — powers real check-in history
    features: dict
    composite_wellbeing_score: float
    risk_label: str
    # None on genuine check-ins; "seeded" on rows created by
    # scripts/seed_forecast_history.py, so demo history can be excluded from
    # any future real-cohort aggregate stats and told apart from real usage.
    source: str | None = None
    # Position in this student's history, 1-based. Only set on seeded rows —
    # real check-ins are ordered by created_at instead. Used by the seed
    # script's idempotency check ((student, sequence) already exists?).
    sequence: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "wellbeing_assessments"


class WellbeingHistoryItem(BaseModel):
    # Added alongside pagination/delete: history items had no id at all
    # before, so a single entry could never be targeted for delete.
    id: str
    score: float
    risk_label: Literal["LOW", "MEDIUM", "HIGH"]
    created_at: datetime
