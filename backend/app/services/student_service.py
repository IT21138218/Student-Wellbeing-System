"""Registered student ACCOUNTS (Mongo `users` with role == "student") and
who is allowed to file wellbeing records against them.

Not to be confused with the S001-S300 cohort in
`Member 1/student_wellbeing_dataset.csv`, which is what /forecast/students
and /social/students list. Those two modules need that CSV because their
models read stored per-student weekly history. The Wellbeing Indicator
takes all 22 features by hand, so its student reference is purely a label
for filing the result — which is exactly why it can point at a real
account instead.
"""

from beanie import PydanticObjectId
from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from app.models.user import ParentOption, StudentOption, User


class _StudentRow(BaseModel):
    """Projection for the picker lists — avatar_data_url is deliberately left
    out: it can be a ~2MB inline base64 string per user, and pulling it for
    every student over the network made these list endpoints very slow."""

    id: PydanticObjectId = Field(alias="_id")
    full_name: str
    email: str
    grade: str | None = None


class _ParentRow(BaseModel):
    """Projection without avatar_data_url (can be ~2MB inline per user)."""

    id: PydanticObjectId = Field(alias="_id")
    full_name: str
    email: str
    linked_student_ids: list[PydanticObjectId] = []


def _to_option(u: _StudentRow, has_avatar: bool) -> StudentOption:
    return StudentOption(
        id=str(u.id),
        full_name=u.full_name,
        email=u.email,
        grade=u.grade,
        has_avatar=has_avatar,
    )


async def list_student_options(user: User) -> list[StudentOption]:
    """Students the caller is allowed to see. Parents get only their linked
    children; admin/teacher/counselor get every registered student."""
    if user.role == "parent":
        ids = user.linked_student_ids or []
        if not ids:
            return []
        query = User.find({"_id": {"$in": ids}, "role": "student"})
    else:  # admin, teacher, counselor — the route's role gate already ran
        query = User.find(User.role == "student")

    # Two light queries instead of loading every full document: the rows
    # without avatars, plus just the ids that have one (for has_avatar).
    students = await query.project(_StudentRow).to_list()
    with_avatar = {
        d["_id"]
        for d in await User.get_pymongo_collection()
        .find({"role": "student", "avatar_data_url": {"$nin": [None, ""]}}, {"_id": 1})
        .to_list(None)
    }
    return sorted(
        (_to_option(u, u.id in with_avatar) for u in students), key=lambda s: s.full_name.lower(),
    )


async def list_parent_options() -> list[ParentOption]:
    """Every parent account with its current child links. Admin only — this
    is the roster behind the Manage Guardians screen."""
    parents = await User.find(User.role == "parent").project(_ParentRow).to_list()
    return sorted(
        (
            ParentOption(
                id=str(p.id),
                full_name=p.full_name,
                email=p.email,
                linked_student_ids=[str(i) for i in (p.linked_student_ids or [])],
            )
            for p in parents
        ),
        key=lambda p: p.full_name.lower(),
    )


def can_access_student(user: User, student_oid: PydanticObjectId) -> bool:
    """Pure predicate — unit-testable without a database (see
    tests/test_student_access.py). Admin bypasses everything, the same
    invariant deps.require_roles() guarantees at the route level."""
    if user.role == "admin":
        return True
    if user.role == "parent":
        return student_oid in (user.linked_student_ids or [])
    return user.role in ("teacher", "counselor")


async def resolve_student(user: User, student_id: str | None) -> User | None:
    """Validate the student reference on an incoming request.

    Returns the student User, or None for an untagged general check-in.
    Raises 400/403/404/422 otherwise.
    """
    if not student_id:
        if user.role == "parent":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Select which of your children this check-in is for.",
            )
        return None  # staff may file an untagged general check-in

    try:
        oid = PydanticObjectId(student_id)
    except Exception as e:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "student_id must be a registered student account id.",
        ) from e

    # Deliberately checked BEFORE the database lookup: an unlinked student who
    # exists and one who doesn't must be indistinguishable to a parent, or the
    # status code becomes an enumeration oracle for other families' account ids.
    if not can_access_student(user, oid):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You can only run check-ins for a student linked to your account.",
        )

    student = await User.get(oid)
    if not student or student.role != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No registered student with that id.")
    return student


async def link_student_to_parent(
    parent_id: PydanticObjectId, student_id: PydanticObjectId, *, link: bool
) -> list[str]:
    """Admin-only. Attach or detach a student account from a parent account.
    Idempotent: linking twice is a no-op, unlinking what isn't linked is fine."""
    parent = await User.get(parent_id)
    if not parent or parent.role != "parent":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No parent account with that id.")
    student = await User.get(student_id)
    if not student or student.role != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No student account with that id.")

    current = list(parent.linked_student_ids or [])
    if link:
        if student_id not in current:
            current.append(student_id)
    else:
        current = [i for i in current if i != student_id]

    parent.linked_student_ids = current
    await parent.save()
    return [str(i) for i in current]
