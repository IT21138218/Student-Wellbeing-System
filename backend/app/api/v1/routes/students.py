"""Registered student accounts, for the staff-facing student pickers.

This replaces what was previously a set of completely UNAUTHENTICATED
CRUD routes over a `students` collection that never held a single record
(the old app/models/student.py Document). Anyone could list or create
students. Both the model and those routes are gone.
"""

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, status

from app.api.deps import require_roles
from app.models.user import ParentOption, StudentOption, User
from app.services.student_service import (
    link_student_to_parent,
    list_parent_options,
    list_student_options,
)

router = APIRouter(prefix="/students", tags=["students"])

# Admin always passes (see deps.require_roles). Parent is allowed through the
# role gate but the service narrows the result to their linked children only.
# Students don't get a roster of their classmates.
_ALLOWED = require_roles("teacher", "counselor", "parent")
# No args => the `user.role not in allowed` check is true for everyone except
# admin, which is exactly "admin only". See deps.py.
_ADMIN_ONLY = require_roles()


# Declared before the /{student_id}/... paths so "" isn't shadowed.
@router.get("", response_model=list[StudentOption])
async def list_students(user: User = Depends(_ALLOWED)) -> list[StudentOption]:
    """Student accounts the caller may file check-ins against."""
    return await list_student_options(user)


@router.get("/parents", response_model=list[ParentOption])
async def list_parents(_: User = Depends(_ADMIN_ONLY)) -> list[ParentOption]:
    """Parent accounts and their current child links. Admin only — declared
    before /{student_id}/... so "parents" isn't parsed as an ObjectId."""
    return await list_parent_options()


@router.post(
    "/{student_id}/guardians/{parent_id}",
    response_model=list[str],
    status_code=status.HTTP_201_CREATED,
)
async def link_guardian(
    student_id: PydanticObjectId,
    parent_id: PydanticObjectId,
    _: User = Depends(_ADMIN_ONLY),
) -> list[str]:
    """Link a parent account to a student account. Returns the parent's full
    linked list. Admin only — this decides who can see a child's wellbeing."""
    return await link_student_to_parent(parent_id, student_id, link=True)


@router.delete("/{student_id}/guardians/{parent_id}", response_model=list[str])
async def unlink_guardian(
    student_id: PydanticObjectId,
    parent_id: PydanticObjectId,
    _: User = Depends(_ADMIN_ONLY),
) -> list[str]:
    return await link_student_to_parent(parent_id, student_id, link=False)
