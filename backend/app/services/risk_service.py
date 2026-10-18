"""Business logic for risk classification: calls the ML model, turns
raw predictions into the narrative/recommendations the UI displays,
and persists the assessment. Routes stay thin and just call this."""

from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.pagination import Page, paginate_offsets
from app.models.risk import EscalateOut, RiskAssessment, RiskFeaturesIn, RiskHistoryItem, RiskPredictionOut
from app.models.user import User, UserName
from app.services.student_service import resolve_student
from ml.risk_classification.model import predict

_NARRATIVE_TEMPLATES = {
    "LOW": "The model classifies this student as LOW risk. Current academic, "
           "behavioral, and wellbeing indicators are within a healthy range.",
    "MEDIUM": "The model classifies this student as MEDIUM risk, driven by a mix "
              "of moderate stress/fatigue load and academic engagement signals.",
    "HIGH": "The model classifies this student as HIGH risk. Multiple indicators "
            "point to elevated stress, fatigue, or disengagement that warrant "
            "prompt educator follow-up.",
}

_RECOMMENDATIONS = {
    "LOW": [
        {"title": "Maintain Momentum", "text": "Continue current habits; check in again next term.",
         "priority": "low", "icon": "✅"},
    ],
    "MEDIUM": [
        {"title": "Counseling Check-in", "text": "Schedule a brief session to discuss stress management strategies.",
         "priority": "medium", "icon": "🗣️"},
        {"title": "Academic Support", "text": "Provide resources or tutoring to improve engagement.",
         "priority": "medium", "icon": "📚"},
    ],
    "HIGH": [
        {"title": "Priority Counseling", "text": "Escalate to a counselor for a same-week check-in.",
         "priority": "high", "icon": "🚨"},
        {"title": "Family Contact", "text": "Loop in a guardian/parent given the elevated risk signal.",
         "priority": "high", "icon": "📞"},
    ],
}


async def classify_and_store(payload: RiskFeaturesIn, user: User) -> RiskPredictionOut:
    # RiskClassification.jsx has no Student Picker (deliberately — it's kept
    # standalone/untagged), so resolve_student is only invoked when a
    # student_id actually shows up (e.g. a future caller/direct API use) —
    # unlike wellbeing_service.predict_and_store, it must NOT run
    # unconditionally, or a parent role would 400 on every untagged run
    # (resolve_student requires a parent to name a student). This still
    # closes the real gap: a student_id that IS supplied gets ownership-
    # checked instead of being trusted blindly.
    student = await resolve_student(user, payload.student_id) if payload.student_id else None

    features = payload.model_dump(exclude={"student_id"})
    result = predict(features)
    label = result["risk_label"]

    narrative = (
        f"{_NARRATIVE_TEMPLATES[label]} (Wellbeing Indicator score feeding into this "
        f"prediction: {result['composite_wellbeing_score']:.1f}/100.)"
    )

    assessment = await RiskAssessment(
        student_id=str(student.id) if student else None,
        student_name=student.full_name if student else None,
        user_id=user.id,
        features=features,
        risk_label=label,
        probabilities=result["probabilities"],
        composite_wellbeing_score=result["composite_wellbeing_score"],
    ).insert()

    return RiskPredictionOut(
        id=str(assessment.id),
        risk_label=label,
        probabilities=result["probabilities"],
        narrative=narrative,
        top_features=result["top_features"],
        eval_metrics=result["eval_metrics"],
        recommendations=_RECOMMENDATIONS[label],
        composite_wellbeing_score=result["composite_wellbeing_score"],
    )


MAX_HISTORY_LIMIT = 100


async def get_history(user: User, page: int = 1, page_size: int = 10) -> Page[RiskHistoryItem]:
    """Real risk-decision history for the logged-in account, most recent
    first — mirrors wellbeing_service.get_history. No student_id filter:
    Risk Classification has no Student Picker, so every run is scoped only
    to the account that ran it, same as it's stored today.

    Assessments run before this field existed have user_id=None and won't
    appear here — there's no reliable way to attribute who ran a historical
    record after the fact, so no backfill is attempted.

    Real page-based pagination (not the old growing "Load More" limit): the
    query itself only fetches this one page via Mongo's skip/limit, and
    `total` (an unlimited .count()) lets the frontend render real page
    numbers instead of just "there might be more".
    """
    skip, page_size, page = paginate_offsets(page, page_size, MAX_HISTORY_LIMIT)
    query = RiskAssessment.find(RiskAssessment.user_id == user.id)
    total = await query.count()
    records = await query.sort(-RiskAssessment.created_at).skip(skip).limit(page_size).to_list()
    return Page(items=[_to_history_item(r) for r in records], total=total, page=page, page_size=page_size)


async def delete_history_item(assessment_id: str, user: User) -> None:
    """Delete one risk decision from history. Same ownership rule as
    coping_service.submit_feedback / this file's own escalate(): the
    account that ran it, or admin — deliberately NOT counselor, unlike
    escalate (an additive, reversible action); deleting someone else's
    record is destructive, so it stays owner-or-admin only."""
    try:
        oid = PydanticObjectId(assessment_id)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid assessment id.") from e

    assessment = await RiskAssessment.get(oid)
    if not assessment or (assessment.user_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No risk decision with that id for this account.")

    await assessment.delete()


def _to_history_item(r: RiskAssessment, decided_by_name: str | None = None) -> RiskHistoryItem:
    return RiskHistoryItem(
        id=str(r.id),
        risk_label=r.risk_label,
        probabilities=r.probabilities,
        # Same static per-label copy classify_and_store uses for the
        # narrative — reused, not re-invented, so History and a fresh
        # decision never disagree in tone. The composite-score sentence
        # classify_and_store appends is left out here since it reads
        # naturally as its own line (composite_wellbeing_score) instead.
        narrative=_NARRATIVE_TEMPLATES[r.risk_label],
        composite_wellbeing_score=r.composite_wellbeing_score,
        escalated=r.escalated,
        escalated_at=r.escalated_at,
        decided_by_name=decided_by_name,
        created_at=r.created_at,
    )


async def get_all_history(page: int = 1, page_size: int = 10) -> Page[RiskHistoryItem]:
    """Admin-only cross-account view — every risk decision by every staff
    account, most recent first, annotated with who made the call. Same
    shape as get_history, just without the user_id filter."""
    skip, page_size, page = paginate_offsets(page, page_size, MAX_HISTORY_LIMIT)
    query = RiskAssessment.find_all()
    total = await query.count()
    records = await query.sort(-RiskAssessment.created_at).skip(skip).limit(page_size).to_list()

    decider_ids = {r.user_id for r in records if r.user_id}
    deciders = await User.find({"_id": {"$in": list(decider_ids)}}).project(UserName).to_list() if decider_ids else []
    name_by_id = {u.id: u.full_name for u in deciders}

    items = [_to_history_item(r, decided_by_name=name_by_id.get(r.user_id)) for r in records]
    return Page(items=items, total=total, page=page, page_size=page_size)


async def escalate(assessment_id: str, user: User, note: str | None) -> EscalateOut:
    """Flag a decision for counselor follow-up. The account that ran the
    original classification may always escalate their own call; admin and
    counselor may escalate ANY account's decision — this is what powers the
    Alerts page's cross-account "Escalate" button (see alert_service.py's
    can_escalate, which mirrors this exact rule), since the whole point of a
    shared alert feed is a counselor acting on a decision someone else made."""
    try:
        oid = PydanticObjectId(assessment_id)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid assessment id.") from e

    assessment = await RiskAssessment.get(oid)
    if not assessment or (assessment.user_id != user.id and user.role not in ("admin", "counselor")):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No risk decision with that id for this account.")

    assessment.escalated = True
    assessment.escalated_at = datetime.now(timezone.utc)
    assessment.escalated_note = note
    await assessment.save()

    return EscalateOut(escalated=True, escalated_at=assessment.escalated_at)
