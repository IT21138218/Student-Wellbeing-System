import asyncio

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.coping import CopingRecord
from app.models.pagination import Page, paginate_offsets
from app.models.social import (
    RealSocialStudentOption, SocialDetectionOut, SocialHistoryItem, SocialNotEligibleOut, SocialRecord,
    StudentSocialSummary,
)
from app.models.user import User
from app.services.student_service import list_student_options, resolve_student
from ml.social_peer_matching.model import detect_and_match, detect_from_real_profile, list_students
from ml.social_peer_matching.real_features import MIN_HISTORY_WEEKS, build_real_social_profile

MAX_HISTORY_LIMIT = 100

_NARRATIVES = {
    "At-Risk / Isolated": "This student's aggregated survey profile places them in the At-Risk / Isolated "
                          "cluster — low belonging and high loneliness relative to peers. Prompt outreach is recommended.",
    "Moderately Connected": "This student's aggregated survey profile places them in the Moderately Connected "
                            "cluster — reasonable social engagement with room to deepen connections.",
}


def get_students() -> list[StudentSocialSummary]:
    return [StudentSocialSummary(**s) for s in list_students()]


async def detect_for(student_id: str, user: User) -> SocialDetectionOut:
    result = detect_and_match(student_id)
    out = SocialDetectionOut(
        **result,
        narrative=_NARRATIVES.get(result["cluster_name"], _NARRATIVES["Moderately Connected"]),
    )

    await SocialRecord(
        user_id=user.id,
        source_student_id=student_id,
        cluster_name=result["cluster_name"],
        isolation_risk_flag=result["isolation_risk_flag"],
    ).insert()

    return out


async def get_history(user: User, page: int = 1, page_size: int = 10) -> Page[SocialHistoryItem]:
    """Real detection history for the logged-in account, most recent first
    — same pattern as risk_service.get_history / coping_service.get_history.
    Real page-based pagination, replacing the previous growing-"Load More"-
    limit approach.

    Detections run before user_id was tracked won't appear here — same
    known limitation documented on the other modules' history functions.
    """
    skip, page_size, page = paginate_offsets(page, page_size, MAX_HISTORY_LIMIT)
    query = SocialRecord.find(SocialRecord.user_id == user.id)
    total = await query.count()
    records = await query.sort(-SocialRecord.created_at).skip(skip).limit(page_size).to_list()
    items = [
        SocialHistoryItem(
            id=str(r.id),
            source_student_id=r.source_student_id,
            cluster_name=r.cluster_name,
            isolation_risk_flag=r.isolation_risk_flag,
            created_at=r.created_at,
        )
        for r in records
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


async def delete_history_item(record_id: str, user: User) -> None:
    """Delete one social isolation detection from history. Same owner-or-
    admin rule as the other 3 modules' delete_history_item."""
    try:
        oid = PydanticObjectId(record_id)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid record id.") from e

    record = await SocialRecord.get(oid)
    if not record or (record.user_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No social detection with that id for this account.")

    await record.delete()


# ---- Real-student path ----


def is_real_student_id(student_id: str) -> bool:
    """A Mongo ObjectId means a real registered account; anything else
    (the CSV cohort's "S001" ids) routes to the unchanged CSV path."""
    return PydanticObjectId.is_valid(student_id)


async def _count_checkins(student_id: str) -> int:
    return await CopingRecord.find(CopingRecord.student_id == student_id).count()


async def list_real_eligible_students(user: User) -> list[RealSocialStudentOption]:
    """Registered students the caller may see, each with their stored
    CopingRecord count and whether that clears MIN_HISTORY_WEEKS. Reuses
    list_student_options() — same parent-only-sees-linked-children rule
    Wellbeing Indicator/Forecasting already established."""
    options = await list_student_options(user)
    # Concurrent counts: one Mongo round trip per student, run in parallel.
    counts = await asyncio.gather(*(_count_checkins(opt.id) for opt in options))
    return [
        RealSocialStudentOption(
            id=opt.id, full_name=opt.full_name, checkins_count=count, eligible=count >= MIN_HISTORY_WEEKS,
        )
        for opt, count in zip(options, counts)
    ]


async def detect_for_real_student(student_id: str, user: User) -> SocialDetectionOut | SocialNotEligibleOut:
    """Ownership enforced by resolve_student — same helper Risk
    Classification/Forecasting use, so a parent still can't reach another
    family's child here."""
    await resolve_student(user, student_id)

    records = (
        await CopingRecord.find(CopingRecord.student_id == student_id)
        .sort(+CopingRecord.created_at)  # oldest first — the trend/std features depend on this order
        .to_list()
    )

    if len(records) < MIN_HISTORY_WEEKS:
        return SocialNotEligibleOut(
            student_id=student_id, checkins_count=len(records), checkins_needed=MIN_HISTORY_WEEKS,
        )

    profile = build_real_social_profile(records)
    result = detect_from_real_profile(student_id, profile)
    out = SocialDetectionOut(
        **result,
        narrative=_NARRATIVES.get(result["cluster_name"], _NARRATIVES["Moderately Connected"]),
    )

    await SocialRecord(
        student_id=PydanticObjectId(student_id),
        user_id=user.id,
        source_student_id=student_id,
        cluster_name=result["cluster_name"],
        isolation_risk_flag=result["isolation_risk_flag"],
    ).insert()

    return out
