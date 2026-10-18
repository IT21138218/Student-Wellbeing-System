"""Alerts service — merges four real, already-persisted "needs attention"
signals into one cross-account feed. No new prediction logic: every signal
here is a field an ML module already wrote on a normal run (see
app/models/alerts.py's docstring). Consistent with report_service.py: no
filtering by `source == "seeded"`, so demo/seed history and real usage both
show up here exactly like they both do in the Cohort Report.
"""

import asyncio
from datetime import datetime

from app.models.alerts import AlertItem, AlertsOut
from app.models.coping import CopingRecord
from app.models.risk import RiskAssessment
from app.models.social import SocialRecord
from app.models.user import User, UserName
from app.models.wellbeing import WellbeingAssessment

_LIMIT_PER_TYPE = 15
_MAX_TOTAL = 50


def _can_escalate(record_user_id, user: User) -> bool:
    """Mirrors risk_service.escalate()'s own ownership rule exactly, so the
    Alerts page never shows an "Escalate" button that would 404 on click."""
    return record_user_id == user.id or user.role in ("admin", "counselor")


async def _risk_high_alerts(user: User) -> list[AlertItem]:
    records = (
        await RiskAssessment.find(RiskAssessment.risk_label == "HIGH", RiskAssessment.escalated == False)  # noqa: E712
        .sort(-RiskAssessment.created_at)
        .limit(_LIMIT_PER_TYPE)
        .to_list()
    )
    return [
        AlertItem(
            id=str(r.id),
            type="risk_high",
            severity="high",
            title="HIGH risk classification",
            detail=(
                f"Composite wellbeing score {r.composite_wellbeing_score:.1f} — escalation recommended."
                if r.composite_wellbeing_score is not None
                else "Escalation recommended."
            ),
            student_label=r.student_name or r.student_id or "Unlabeled",
            created_at=r.created_at,
            can_escalate=_can_escalate(r.user_id, user),
        )
        for r in records
    ]


async def _isolation_alerts() -> list[AlertItem]:
    records = (
        await SocialRecord.find(SocialRecord.isolation_risk_flag == True)  # noqa: E712
        .sort(-SocialRecord.created_at)
        .limit(_LIMIT_PER_TYPE)
        .to_list()
    )
    real_ids = {r.student_id for r in records if r.student_id}
    real_users = await User.find({"_id": {"$in": list(real_ids)}}).project(UserName).to_list() if real_ids else []
    name_by_id = {u.id: u.full_name for u in real_users}

    return [
        AlertItem(
            id=str(r.id),
            type="isolation_flag",
            severity="medium",
            title="Social isolation risk flagged",
            detail=f"Cluster: {r.cluster_name}.",
            student_label=name_by_id.get(r.student_id) or r.source_student_id or "Unlabeled",
            created_at=r.created_at,
        )
        for r in records
    ]


async def _coping_low_confidence_alerts() -> list[AlertItem]:
    records = (
        await CopingRecord.find(CopingRecord.low_confidence == True)  # noqa: E712
        .sort(-CopingRecord.created_at)
        .limit(_LIMIT_PER_TYPE)
        .to_list()
    )
    return [
        AlertItem(
            id=str(r.id),
            type="coping_low_confidence",
            severity="low",
            title="Low-confidence coping recommendation",
            detail=f"Recommended: {r.top_recommendation}. Model margins were thin — worth a second look.",
            student_label=r.student_name or r.student_id or "Unlabeled",
            created_at=r.created_at,
        )
        for r in records
    ]


async def _wellbeing_high_alerts() -> list[AlertItem]:
    records = (
        await WellbeingAssessment.find(WellbeingAssessment.risk_label == "HIGH")
        .sort(-WellbeingAssessment.created_at)
        .limit(_LIMIT_PER_TYPE)
        .to_list()
    )
    return [
        AlertItem(
            id=str(r.id),
            type="wellbeing_high",
            severity="high",
            title="HIGH risk wellbeing check-in",
            detail=f"Composite wellbeing score {r.composite_wellbeing_score:.1f}.",
            student_label=r.student_name or r.student_id or "Unlabeled",
            created_at=r.created_at,
        )
        for r in records
    ]


def _sort_key(item: AlertItem) -> datetime:
    return item.created_at


async def get_alerts(user: User) -> AlertsOut:
    # All of these are independent Mongo queries — run them concurrently
    # (each is a network round trip) instead of one after another.
    (
        risk_alerts, isolation, coping, wellbeing,
        open_count, isolation_flagged_count, coping_low_confidence_count, wellbeing_high_count,
    ) = await asyncio.gather(
        _risk_high_alerts(user),
        _isolation_alerts(),
        _coping_low_confidence_alerts(),
        _wellbeing_high_alerts(),
        RiskAssessment.find(
            RiskAssessment.risk_label == "HIGH", RiskAssessment.escalated == False  # noqa: E712
        ).count(),
        SocialRecord.find(SocialRecord.isolation_risk_flag == True).count(),  # noqa: E712
        CopingRecord.find(CopingRecord.low_confidence == True).count(),  # noqa: E712
        WellbeingAssessment.find(WellbeingAssessment.risk_label == "HIGH").count(),
    )
    other_alerts = isolation + coping + wellbeing

    merged = sorted(risk_alerts + other_alerts, key=_sort_key, reverse=True)[:_MAX_TOTAL]

    # Unlimited counts (not the capped/limited slices above) so the sidebar
    # badge AND the per-type stat tiles stay accurate even past
    # _LIMIT_PER_TYPE — `merged` itself is truncated and must never be
    # counted directly for these.

    return AlertsOut(
        alerts=merged,
        open_count=open_count,
        isolation_flagged_count=isolation_flagged_count,
        coping_low_confidence_count=coping_low_confidence_count,
        wellbeing_high_count=wellbeing_high_count,
    )
