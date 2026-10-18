from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class StudentSocialSummary(BaseModel):
    student_id: str
    survey_count: int
    social_group: str
    is_isolated: bool


class ClusterDistance(BaseModel):
    cluster: str
    distance: float


class PeerMatch(BaseModel):
    student_id: str
    cluster: str
    compatibility: float


class SocialEvalMetrics(BaseModel):
    silhouette_score: float
    calinski_harabasz: float
    davies_bouldin_index: float
    n_clusters: int


class SocialDetectionOut(BaseModel):
    student_id: str
    cluster_label: int
    cluster_name: str
    cluster_icon: str
    narrative: str
    isolation_risk_flag: bool
    # False on the real-student path: the CSV path's isolation_risk_flag
    # also consults an IsolationForest fit on the training cohort, but that
    # artifact was never exported — real detections use cluster membership
    # only. Surfaced so the UI can say so, not hide the gap.
    anomaly_detector_available: bool = True
    # Peer matches are always drawn from the training cohort — a fresh
    # install won't have enough real eligible students for a meaningful
    # real peer pool. Always "training_cohort" today; kept as a field so a
    # future real peer pool doesn't need a response-shape change.
    peer_pool: Literal["training_cohort"] = "training_cohort"
    survey_count: int
    profile: dict[str, float]
    eval_metrics: SocialEvalMetrics
    cluster_distances: list[ClusterDistance]
    peer_matches: list[PeerMatch]
    recommendations: list[str]


# ---- Real-student path (source=real). The CSV path above is unchanged. ----


class RealSocialStudentOption(BaseModel):
    id: str
    full_name: str
    checkins_count: int
    eligible: bool


class SocialNotEligibleOut(BaseModel):
    eligible: Literal[False] = False
    student_id: str
    checkins_count: int
    checkins_needed: int


class SocialRecord(Document):
    # The real registered student this detection is about, once the
    # real-student path exists (None on today's CSV-cohort runs).
    student_id: PydanticObjectId | None = None
    user_id: PydanticObjectId | None = None  # the logged-in account that ran this — powers real history
    source_student_id: str  # CSV cohort id ("S001") today; may equal student_id's str form once real-student detection exists
    cluster_name: str
    isolation_risk_flag: bool
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "social_detections"


class SocialHistoryItem(BaseModel):
    id: str
    source_student_id: str
    cluster_name: str
    isolation_risk_flag: bool
    created_at: datetime
