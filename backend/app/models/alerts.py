"""Alerts: a real, cross-account feed aggregating the "needs attention"
signals every ML module already writes into Mongo — HIGH-risk decisions not
yet escalated, isolation-flagged social detections, low-confidence coping
recommendations, and HIGH-risk wellbeing check-ins. No new ML, no CSV — just
surfacing fields that already exist (see app/services/alert_service.py)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

AlertType = Literal["risk_high", "isolation_flag", "coping_low_confidence", "wellbeing_high"]
AlertSeverity = Literal["high", "medium", "low"]


class AlertItem(BaseModel):
    id: str  # the source record's Mongo id
    type: AlertType
    severity: AlertSeverity
    title: str
    detail: str
    student_label: str  # student_name, else student_id, else "Unlabeled"
    created_at: datetime
    # Only meaningful for type == "risk_high" — mirrors risk_service.escalate()'s
    # own ownership rule so the "Escalate" button only appears where the click
    # would actually succeed.
    can_escalate: bool = False


class AlertsOut(BaseModel):
    # Capped (see alert_service.py's _LIMIT_PER_TYPE/_MAX_TOTAL) — enough to
    # triage from, not a full archive.
    alerts: list[AlertItem]
    # True, UNCAPPED counts per type — used for the stat tiles instead of
    # counting `alerts` itself, which is capped and would silently
    # under-report once a type has more open items than fits in the list.
    open_count: int  # unescalated HIGH-risk — the only actionable, unresolved type
    isolation_flagged_count: int
    coping_low_confidence_count: int
    wellbeing_high_count: int
