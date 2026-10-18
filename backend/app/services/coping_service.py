from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.coping import (
    CopingFeaturesIn, CopingFeedbackOut, CopingHistoryItem, CopingRecommendationOut, CopingRecord,
)
from app.models.pagination import Page, paginate_offsets
from app.models.user import User
from app.services.student_service import resolve_student
from ml.coping_recommendation.model import EFFECTIVENESS_LABELS, predict

MAX_HISTORY_LIMIT = 100

_APPLY_STEPS = {
    "Deep breathing": [
        {"step": 1, "title": "Find a Quiet Space", "text": "Step away to a place where you won't be disturbed."},
        {"step": 2, "title": "Get Comfortable", "text": "Sit or lie down in a relaxed position."},
        {"step": 3, "title": "Focus on Breathing", "text": "Inhale for 4 seconds, hold for 4, exhale for 6."},
        {"step": 4, "title": "Repeat", "text": "Continue for 3-5 minutes until your heart rate slows."},
    ],
    "Talking to someone": [
        {"step": 1, "title": "Pick Someone You Trust", "text": "Choose a friend, family member, or teacher you feel safe with."},
        {"step": 2, "title": "Name the Feeling", "text": "Say what's stressing you in one or two sentences."},
        {"step": 3, "title": "Ask for What You Need", "text": "Tell them if you want advice or just to be heard."},
        {"step": 4, "title": "Follow Up", "text": "Check back in with them after the stressor has passed."},
    ],
    "Exercise/Sports": [
        {"step": 1, "title": "Pick Something You Enjoy", "text": "A sport, a walk, a run — whatever you'll actually do."},
        {"step": 2, "title": "Start Short", "text": "Even 10-15 minutes helps; you don't need a full workout."},
        {"step": 3, "title": "Notice the Shift", "text": "Pay attention to how your stress feels afterward."},
        {"step": 4, "title": "Make it Regular", "text": "A few times a week compounds the benefit."},
    ],
    "Journaling": [
        {"step": 1, "title": "Set a Timer", "text": "5-10 minutes is enough — don't overthink it."},
        {"step": 2, "title": "Write Without Editing", "text": "Get the thoughts out first, worry about neatness never."},
        {"step": 3, "title": "Name What's Stressing You", "text": "Be specific — vague worries are harder to process."},
        {"step": 4, "title": "Re-read Later", "text": "Come back in a day or two to see it with fresh eyes."},
    ],
    "Music/Relaxation": [
        {"step": 1, "title": "Pick a Calming Playlist", "text": "Something familiar, not something new to focus on."},
        {"step": 2, "title": "Minimize Distractions", "text": "Headphones on, phone notifications off."},
        {"step": 3, "title": "Just Listen", "text": "Let your mind settle rather than multitasking."},
        {"step": 4, "title": "Use it Proactively", "text": "Try it before a stressful moment, not just after."},
    ],
}

_DEFAULT_STEPS = [
    {"step": 1, "title": "Set Aside Time", "text": "Block 10-15 minutes with no distractions."},
    {"step": 2, "title": "Start Small", "text": "Try the strategy once today, not perfectly — just once."},
    {"step": 3, "title": "Reflect", "text": "Note how you felt before and after."},
    {"step": 4, "title": "Repeat Tomorrow", "text": "Consistency matters more than intensity."},
]


async def recommend_and_store(payload: CopingFeaturesIn, user: User) -> CopingRecommendationOut:
    # No Student Picker on this page (same situation Risk Classification was
    # in) — resolve_student only runs when a student_id actually shows up,
    # so an untagged run (the normal case today) never forces a parent-style
    # "select a child" requirement that doesn't apply to teacher/student use.
    #
    # Self-tagging: a student running this on themselves IS the student in
    # question, so tag it to their own account automatically — otherwise a
    # student's own real usage would never accumulate real per-student
    # history (this is also Social Isolation's real data source: see
    # ml/social_peer_matching/real_features.py).
    if payload.student_id:
        student = await resolve_student(user, payload.student_id)
    elif user.role == "student":
        student = user
    else:
        student = None

    raw = payload.model_dump(exclude={"student_id"})
    result = predict(raw, strategies_used=payload.strategies_used)

    effectiveness_label = EFFECTIVENESS_LABELS[result["selected_effectiveness"]]
    narrative = (
        f"For a {payload.stress_trigger.lower()} trigger, {result['selected_strategy']} is predicted "
        f"'{effectiveness_label}' for this student. {result['top_recommendation']} scores marginally "
        f"higher in this context — the model's overall accuracy is modest (~53%), so treat this as a "
        f"data point alongside educator judgment, not a directive."
    )

    record = await CopingRecord(
        student_id=str(student.id) if student else None,
        student_name=student.full_name if student else None,
        user_id=user.id,
        features=raw,
        top_recommendation=result["top_recommendation"],
        selected_effectiveness=result["selected_effectiveness"],
        low_confidence=result["low_confidence"],
    ).insert()

    return CopingRecommendationOut(
        **result,
        narrative=narrative,
        apply_steps=_APPLY_STEPS.get(result["top_recommendation"], _DEFAULT_STEPS),
        record_id=str(record.id),
    )


async def get_history(user: User, page: int = 1, page_size: int = 10) -> Page[CopingHistoryItem]:
    """Real coping-recommendation history for the logged-in account, most
    recent first — same pattern as risk_service.get_history. Real page-based
    pagination, replacing the previous growing-"Load More"-limit approach."""
    skip, page_size, page = paginate_offsets(page, page_size, MAX_HISTORY_LIMIT)
    query = CopingRecord.find(CopingRecord.user_id == user.id)
    total = await query.count()
    records = await query.sort(-CopingRecord.created_at).skip(skip).limit(page_size).to_list()
    items = [
        CopingHistoryItem(
            id=str(r.id),
            stress_trigger=r.features.get("stress_trigger", ""),
            selected_strategy=r.features.get("coping_primary_strategy", ""),
            selected_effectiveness=r.selected_effectiveness,
            effectiveness_label=EFFECTIVENESS_LABELS[r.selected_effectiveness],
            top_recommendation=r.top_recommendation,
            low_confidence=r.low_confidence,
            actual_effectiveness=r.actual_effectiveness,
            actual_effectiveness_label=(
                EFFECTIVENESS_LABELS[r.actual_effectiveness] if r.actual_effectiveness is not None else None
            ),
            created_at=r.created_at,
        )
        for r in records
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


async def delete_history_item(record_id: str, user: User) -> None:
    """Delete one coping recommendation from history. Same owner-or-admin
    rule this file's own submit_feedback already uses."""
    try:
        oid = PydanticObjectId(record_id)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid record id.") from e

    record = await CopingRecord.get(oid)
    if not record or (record.user_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No coping recommendation with that id for this account.")

    await record.delete()


async def submit_feedback(record_id: str, user: User, actual_effectiveness: int) -> CopingFeedbackOut:
    """Close the loop on a past recommendation: did the strategy actually
    help, once someone tried it? Ownership-checked the same way
    risk_service.escalate is — the account that ran it, or admin."""
    try:
        oid = PydanticObjectId(record_id)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid record id.") from e

    record = await CopingRecord.get(oid)
    if not record or (record.user_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No coping recommendation with that id for this account.")

    record.actual_effectiveness = actual_effectiveness
    record.actual_feedback_at = datetime.now(timezone.utc)
    await record.save()

    return CopingFeedbackOut(
        actual_effectiveness=actual_effectiveness,
        actual_effectiveness_label=EFFECTIVENESS_LABELS[actual_effectiveness],
        matched_prediction=(actual_effectiveness == record.selected_effectiveness),
    )
