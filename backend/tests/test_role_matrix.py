"""End-to-end role gate matrix — the single source of truth for "which role
can reach which module", checked against BOTH the backend route dependencies
and the frontend's constants/permissions.js table.

Why this file exists: role gating was previously spread across ~11 route
files and mirrored by hand in the frontend, with nothing keeping the two in
sync. This exercises every gate's real `checker` for every role and fails
loudly the moment a route and the UI disagree.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.v1.routes import alerts, coping, forecast, quiz, report, risk, social, students, wellbeing
from app.models.user import User

ALL_ROLES = ["admin", "teacher", "counselor", "student", "parent"]

# gate object  ->  set of NON-admin roles it must allow (admin is always allowed)
GATES: dict[str, tuple[object, set[str]]] = {
    "wellbeing._ALLOWED": (wellbeing._ALLOWED, {"teacher", "counselor", "parent"}),
    "risk._ALLOWED": (risk._ALLOWED, {"teacher", "counselor", "parent"}),
    "risk._STAFF_ONLY": (risk._STAFF_ONLY, {"teacher", "counselor"}),
    "risk._ADMIN_ONLY": (risk._ADMIN_ONLY, set()),
    "quiz._ALLOWED": (quiz._ALLOWED, {"teacher", "student"}),
    "quiz._ADMIN_ONLY": (quiz._ADMIN_ONLY, set()),
    "coping._ALLOWED": (coping._ALLOWED, {"teacher", "counselor", "student"}),
    "social._ALLOWED": (social._ALLOWED, {"teacher", "counselor"}),
    "forecast._ALLOWED": (forecast._ALLOWED, {"teacher", "counselor", "parent"}),
    "report._ALLOWED": (report._ALLOWED, {"counselor"}),
    "alerts._ALLOWED": (alerts._ALLOWED, {"teacher", "counselor"}),
    "students._ALLOWED": (students._ALLOWED, {"teacher", "counselor", "parent"}),
    "students._ADMIN_ONLY": (students._ADMIN_ONLY, set()),
}

# frontend permissions.js tool name  ->  backend gate that must back it
FRONTEND_TOOL_TO_GATE = {
    "wellbeing": "wellbeing._ALLOWED",
    "classification": "risk._ALLOWED",
    "risk": "forecast._ALLOWED",
    "quiz": "quiz._ALLOWED",
    "topic": "quiz._ALLOWED",
    "social": "social._ALLOWED",
    "coping": "coping._ALLOWED",
    "reports": "report._ALLOWED",
    "alerts": "alerts._ALLOWED",
}

PERMISSIONS_JS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "constants" / "permissions.js"


def make_user(role: str) -> User:
    return User.model_construct(email="x@example.com", full_name="X", hashed_password="", role=role)


def _passes(gate, role: str) -> bool:
    try:
        asyncio.run(gate(user=make_user(role)))
        return True
    except HTTPException as e:
        assert e.status_code == 403
        return False


@pytest.mark.parametrize("name", list(GATES))
def test_gate_allows_exactly_its_declared_roles(name):
    gate, allowed = GATES[name]
    for role in ALL_ROLES:
        expected = role == "admin" or role in allowed
        assert _passes(gate, role) is expected, f"{name}: role '{role}' expected allowed={expected}"


def test_admin_reaches_every_gate():
    for name, (gate, _) in GATES.items():
        assert _passes(gate, "admin"), f"{name}: admin must always pass"


def _parse_frontend_tool_roles() -> dict[str, list[str]]:
    src = PERMISSIONS_JS.read_text(encoding="utf-8")
    block = re.search(r"TOOL_ROLES\s*=\s*\{(.*?)\n\}", src, re.S).group(1)
    out: dict[str, list[str]] = {}
    for key, arr in re.findall(r"(\w+):\s*\[([^\]]*)\]", block):
        out[key] = re.findall(r"'([^']+)'", arr)
    return out


def test_frontend_permissions_match_backend_gates():
    frontend = _parse_frontend_tool_roles()
    assert set(frontend) == set(FRONTEND_TOOL_TO_GATE), (
        "permissions.js TOOL_ROLES keys drifted from the backend mapping in this test"
    )
    for tool, gate_name in FRONTEND_TOOL_TO_GATE.items():
        _, backend_roles = GATES[gate_name]
        assert set(frontend[tool]) == backend_roles, (
            f"permissions.js '{tool}' = {sorted(frontend[tool])} but backend "
            f"{gate_name} allows {sorted(backend_roles)}"
        )


def test_permissions_js_is_valid_and_admin_is_implicit():
    src = PERMISSIONS_JS.read_text(encoding="utf-8")
    # admin must never be listed per-tool — it's handled by the early return.
    block = re.search(r"TOOL_ROLES\s*=\s*\{(.*?)\n\}", src, re.S).group(1)
    assert "'admin'" not in block, "admin should be implicit in canAccessTool, not listed per-tool"
    assert "if (role === 'admin') return true;" in src
