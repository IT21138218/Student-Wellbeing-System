"""Admin CLI for parent -> child links.

The API routes that do this (POST/DELETE /students/{student_id}/guardians/
{parent_id}) are admin-only and have no UI yet, so this is how you manage
links from a terminal.

Run from the backend/ directory:

    .venv/Scripts/python.exe scripts/guardians.py list
    .venv/Scripts/python.exe scripts/guardians.py link   <parent-email> <student-email>
    .venv/Scripts/python.exe scripts/guardians.py unlink <parent-email> <student-email>
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import close_mongo_connection, connect_to_mongo  # noqa: E402
from app.models.user import User  # noqa: E402


async def _find(email: str, expect_role: str) -> User:
    user = await User.find_one(User.email == email)
    if not user:
        raise SystemExit(f"No account with email {email!r}.")
    if user.role != expect_role:
        raise SystemExit(f"{email} has role {user.role!r}, expected {expect_role!r}.")
    return user


async def cmd_list() -> None:
    users = await User.find_all().to_list()
    by_id = {u.id: u for u in users}
    print(f"\n{'ROLE':<10} {'EMAIL':<38} {'NAME':<22} LINKED CHILDREN")
    print("-" * 100)
    for u in sorted(users, key=lambda x: (x.role, x.email)):
        linked = ""
        if u.role == "parent":
            names = [
                (by_id[i].full_name if i in by_id else f"<missing {i}>")
                for i in (u.linked_student_ids or [])
            ]
            linked = ", ".join(names) if names else "(none yet)"
        print(f"{u.role:<10} {u.email:<38} {u.full_name:<22} {linked}")

    if not any(u.role == "parent" for u in users):
        print("\nNo parent accounts exist. Register one in the app (role 'parent'),")
        print("then run:  scripts/guardians.py link <parent-email> <student-email>")
    print()


async def cmd_link(parent_email: str, student_email: str, *, link: bool) -> None:
    parent = await _find(parent_email, "parent")
    student = await _find(student_email, "student")

    current = list(parent.linked_student_ids or [])
    if link:
        if student.id in current:
            print(f"Already linked: {parent.full_name} -> {student.full_name}")
            return
        current.append(student.id)
        verb = "Linked"
    else:
        if student.id not in current:
            print(f"Not linked: {parent.full_name} -> {student.full_name}")
            return
        current = [i for i in current if i != student.id]
        verb = "Unlinked"

    parent.linked_student_ids = current
    await parent.save()
    print(f"{verb}: {parent.full_name} ({parent.email}) -> {student.full_name} ({student.email})")
    print(f"  {parent.full_name} now has {len(current)} linked child(ren).")


async def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] not in {"list", "link", "unlink"}:
        raise SystemExit(__doc__)

    await connect_to_mongo()
    try:
        if args[0] == "list":
            await cmd_list()
        else:
            if len(args) != 3:
                raise SystemExit(f"Usage: guardians.py {args[0]} <parent-email> <student-email>")
            await cmd_link(args[1], args[2], link=args[0] == "link")
    finally:
        await close_mongo_connection()


asyncio.run(main())
