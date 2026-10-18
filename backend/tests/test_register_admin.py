"""Public sign-up must refuse role=admin."""

import asyncio

import pytest
from fastapi import HTTPException

from app.models.user import RegisterIn
from app.services.auth_service import register_user


def test_self_register_as_admin_is_forbidden():
    payload = RegisterIn(email="evil@example.com", full_name="Evil", password="Password123", role="admin")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(register_user(payload))
    assert exc.value.status_code == 403
