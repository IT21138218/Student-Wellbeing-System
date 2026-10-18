from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

RiskLabel = Literal["LOW", "MEDIUM", "HIGH"]


# ---- Request: the real 22 raw columns from student_wellbeing_dataset.csv,
# same shape as WellbeingFeaturesIn. Internally chained: this is sent to
# the Wellbeing Indicator model first to get composite_wellbeing_score,
# which Member 2's real risk classifier then uses as one of its own
# inputs — see ml/risk_classification/model.py. ----
class RiskFeaturesIn(BaseModel):
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

    student_id: str | None = None  # optional: attach result to a student record


# ---- Response: mirrors what RiskClassification.jsx already renders ----
class FeatureContribution(BaseModel):
    feature: str
    importance: float
    direction: Literal["positive", "negative"]


class EvalMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    roc_auc: float
    cohen_kappa: float


class Recommendation(BaseModel):
    title: str
    text: str
    priority: Literal["low", "medium", "high"]
    icon: str


class RiskPredictionOut(BaseModel):
    id: str  # the just-inserted RiskAssessment's id — lets the UI escalate this exact decision immediately
    risk_label: RiskLabel
    probabilities: dict[RiskLabel, float]
    narrative: str
    top_features: list[FeatureContribution]
    eval_metrics: EvalMetrics
    recommendations: list[Recommendation]
    # from the internal Wellbeing Indicator call this pipeline chains through
    composite_wellbeing_score: float | None = None


# ---- Persisted record (Mongo collection: risk_assessments) ----
class RiskAssessment(Document):
    # str, not PydanticObjectId — matches WellbeingAssessment.student_id's
    # convention (a label, not a queryable FK) since nothing here filters by it.
    student_id: str | None = None
    student_name: str | None = None  # denormalized, mirrors WellbeingAssessment — None until a Student Picker exists
    user_id: PydanticObjectId | None = None  # the logged-in account that ran this — powers real history
    features: dict
    risk_label: RiskLabel
    probabilities: dict[str, float]
    composite_wellbeing_score: float | None = None  # Stage 1 passthrough, same figure the Pipeline Trace card shows
    escalated: bool = False
    escalated_at: datetime | None = None
    escalated_note: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "risk_assessments"


# ---- History (GET /risk/history, GET /risk/admin/overview) ----
class RiskHistoryItem(BaseModel):
    id: str
    risk_label: RiskLabel
    probabilities: dict[str, float]
    narrative: str
    composite_wellbeing_score: float | None = None
    escalated: bool = False
    escalated_at: datetime | None = None
    # Only populated in the admin cross-account overview — a personal
    # history list is always "decided by you", so it stays None there.
    decided_by_name: str | None = None
    created_at: datetime


class EscalateIn(BaseModel):
    note: str | None = Field(None, max_length=1000)


class EscalateOut(BaseModel):
    escalated: bool
    escalated_at: datetime
