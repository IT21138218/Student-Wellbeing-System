from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

Trigger = Literal["Exams", "Family", "Friends", "Homework", "Teachers", "Time pressure"]
Strategy = Literal[
    "Deep breathing", "Exercise/Sports", "Gaming/Entertainment", "Ignoring/Avoidance",
    "Journaling", "Music/Relaxation", "Sleeping", "Talking to someone",
]


class CopingFeaturesIn(BaseModel):
    week: int = Field(..., ge=1, le=12)
    stress_trigger: Trigger
    coping_primary_strategy: Strategy
    strategies_used: list[Strategy] = Field(..., min_length=1)
    break_frequency: float = Field(..., ge=1, le=5)
    talks_to_someone: int = Field(..., ge=0, le=1)
    belonging_score: float = Field(..., ge=1, le=5)
    loneliness_score: float = Field(..., ge=1, le=5)
    help_seeking_comfort: float = Field(..., ge=1, le=5)
    group_inclusion: float = Field(..., ge=1, le=5)
    has_support_person: int = Field(..., ge=0, le=1)
    class_support: float = Field(..., ge=1, le=5)
    class_competition: float = Field(..., ge=1, le=5)
    peer_helping: float = Field(..., ge=1, le=5)

    student_id: str | None = None


class RankedStrategy(BaseModel):
    strategy: str
    icon: str
    prob_class2: float


class CopingEvalMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_macro: float
    roc_auc: float | None = None
    cohen_kappa: float


class ApplyStep(BaseModel):
    step: int
    title: str
    text: str


class CopingRecommendationOut(BaseModel):
    selected_strategy: str
    selected_effectiveness: int
    selected_probs: dict[str, float]
    top_recommendation: str
    top_rec_icon: str
    narrative: str
    ranked_strategies: list[RankedStrategy]
    eval_metrics: CopingEvalMetrics
    apply_steps: list[ApplyStep]
    # True when the model's own margins are thin (see
    # ml/coping_recommendation/model.py's low_confidence computation) — not
    # a real calibrated probability, but a genuine "don't over-trust this
    # one" signal worth surfacing given the model's modest ~53% accuracy.
    low_confidence: bool
    record_id: str  # the just-inserted CopingRecord's id — lets History submit feedback on it


class CopingRecord(Document):
    # str, not PydanticObjectId — matches WellbeingAssessment/RiskAssessment's
    # convention (a label, not a queryable FK).
    student_id: str | None = None
    student_name: str | None = None  # denormalized, same pattern as the other modules
    user_id: PydanticObjectId | None = None  # the logged-in account that ran this — powers real history
    features: dict
    top_recommendation: str
    selected_effectiveness: int
    low_confidence: bool = False
    # Filled in later, once someone actually tries the strategy and reports
    # back — see submit_feedback(). None until then.
    actual_effectiveness: int | None = None
    actual_feedback_at: datetime | None = None
    # None on genuine check-ins; "seeded" on rows created by
    # scripts/seed_social_isolation_history.py — same convention as
    # WellbeingAssessment.source, so demo history stays distinguishable
    # from real usage.
    source: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "coping_recommendations"


class CopingHistoryItem(BaseModel):
    id: str
    stress_trigger: str
    selected_strategy: str
    selected_effectiveness: int
    effectiveness_label: str
    top_recommendation: str
    low_confidence: bool
    actual_effectiveness: int | None = None
    actual_effectiveness_label: str | None = None
    created_at: datetime


class CopingFeedbackIn(BaseModel):
    actual_effectiveness: int = Field(..., ge=0, le=2)


class CopingFeedbackOut(BaseModel):
    actual_effectiveness: int
    actual_effectiveness_label: str
    matched_prediction: bool  # did the model's original guess agree with what actually happened?
