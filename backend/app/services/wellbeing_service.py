from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.pagination import Page, paginate_offsets
from app.models.user import User
from app.models.wellbeing import (
    WellbeingAssessment, WellbeingFeaturesIn, WellbeingHistoryItem, WellbeingPredictionOut,
)
from app.services.student_service import resolve_student
from ml.wellbeing_indicator.model import predict

MAX_HISTORY_LIMIT = 100

_NARRATIVES = {
    "LOW": "The model finds strong overall wellbeing — sleep, stress, and support indicators are all in a healthy range.",
    "MEDIUM": "The model finds moderate wellbeing. Some dimensions look solid while others — likely stress or sleep — need attention.",
    "HIGH": "The model finds significant wellbeing concerns across multiple dimensions. Prompt follow-up is recommended.",
}

_RECOMMENDATIONS = {
    "LOW": [
        {"icon": "✅", "title": "Maintain Habits", "text": "Current routines are working well — keep them up.", "priority": "low"},
    ],
    "MEDIUM": [
        {"icon": "🧘‍♂️", "title": "Stress Reduction", "text": "Short mindfulness breaks before intensive study sessions can help.", "priority": "medium"},
        {"icon": "💤", "title": "Sleep Hygiene", "text": "A consistent sleep schedule improves recovery and stress tolerance.", "priority": "medium"},
    ],
    "HIGH": [
        {"icon": "🚨", "title": "Priority Check-in", "text": "Escalate to a counselor for a same-week conversation.", "priority": "high"},
        {"icon": "🤝", "title": "Social Connection", "text": "Encourage participation in group activities to rebuild belonging.", "priority": "high"},
    ],
}


async def predict_and_store(payload: WellbeingFeaturesIn, user: User) -> WellbeingPredictionOut:
    # Resolved FIRST, before predict() — a request that's going to be rejected
    # (parent filing against someone else's child, unknown id) should not burn
    # a model run. Raises 400/403/404/422; returns None for an untagged check-in.
    student = await resolve_student(user, payload.student_id)

    features = payload.model_dump(exclude={"student_id"})
    result = predict(features)
    label = result["risk_label"]

    out = WellbeingPredictionOut(
        **result,
        score_narrative=_NARRATIVES[label],
        recommendations=_RECOMMENDATIONS[label],
    )

    await WellbeingAssessment(
        student_id=str(student.id) if student else None,
        student_name=student.full_name if student else None,
        user_id=user.id,
        features=features,
        composite_wellbeing_score=result["composite_wellbeing_score"],
        risk_label=label,
    ).insert()

    return out


async def get_history(
    user: User, page: int = 1, page_size: int = 10, student_id: str | None = None
) -> Page[WellbeingHistoryItem]:
    """Real check-in history for the logged-in account — replaces what was
    previously a browser-session-only list that reset on every page reload.
    When student_id is given, narrows to that one student's check-ins only
    (so a teacher/counselor tracking multiple students sees each one's own
    timeline instead of everything mixed together).

    Real page-based pagination — was previously hardcapped at a silent
    default of 5 with NO way for a caller to raise it at all (unlike Risk/
    Coping/Social, this route never exposed a `limit` param), so anyone
    with more than 5 real check-ins could never see or export the rest.
    """
    if student_id:
        # Defence in depth: the user_id filter below already means a parent
        # can only ever see rows they created themselves, but this makes the
        # ownership 403 explicit and directly testable.
        await resolve_student(user, student_id)

    skip, page_size, page = paginate_offsets(page, page_size, MAX_HISTORY_LIMIT)
    conditions = [WellbeingAssessment.user_id == user.id]
    if student_id:
        conditions.append(WellbeingAssessment.student_id == student_id)
    query = WellbeingAssessment.find(*conditions)
    total = await query.count()
    records = await query.sort(-WellbeingAssessment.created_at).skip(skip).limit(page_size).to_list()
    items = [
        WellbeingHistoryItem(id=str(r.id), score=r.composite_wellbeing_score, risk_label=r.risk_label, created_at=r.created_at)
        for r in records
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


async def delete_history_item(assessment_id: str, user: User) -> None:
    """Delete one check-in from history. Same owner-or-admin rule as
    risk_service.delete_history_item / coping_service.submit_feedback."""
    try:
        oid = PydanticObjectId(assessment_id)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid check-in id.") from e

    assessment = await WellbeingAssessment.get(oid)
    if not assessment or (assessment.user_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No wellbeing check-in with that id for this account.")

    await assessment.delete()
