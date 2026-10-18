"""Who may file a wellbeing check-in against which student.

can_access_student is deliberately a pure function so the rule can be tested
without a database or an async fixture — the surrounding 403/404 wiring is
covered by the route-level checks.
"""

import pytest
from beanie import PydanticObjectId

from app.models.user import User
from app.services.student_service import can_access_student

CHILD = PydanticObjectId()
OTHER = PydanticObjectId()


def make_user(role: str, linked: list[PydanticObjectId] | None = None) -> User:
    # model_construct skips validation so no DB/Beanie init is needed.
    return User.model_construct(
        email="x@example.com", full_name="X", hashed_password="",
        role=role, linked_student_ids=linked or [],
    )


@pytest.mark.parametrize("role", ["teacher", "counselor"])
def test_staff_may_access_any_student(role):
    assert can_access_student(make_user(role), CHILD)
    assert can_access_student(make_user(role), OTHER)


def test_admin_bypasses_everything():
    """Mirrors the unconditional admin bypass in deps.require_roles."""
    admin = make_user("admin")
    assert can_access_student(admin, CHILD)
    assert can_access_student(admin, OTHER)


def test_parent_only_reaches_linked_child():
    parent = make_user("parent", linked=[CHILD])
    assert can_access_student(parent, CHILD)
    assert not can_access_student(parent, OTHER)


def test_parent_with_no_links_reaches_nobody():
    assert not can_access_student(make_user("parent"), CHILD)


def test_student_role_has_no_access():
    assert not can_access_student(make_user("student"), CHILD)
