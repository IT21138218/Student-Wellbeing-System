"""Create (or reset) an admin account — public sign-up cannot create admins.

Run from backend/:
    .venv/Scripts/python.exe scripts/create_admin.py you@example.com "Full Name" 'Password123'
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from beanie import init_beanie  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.user import User  # noqa: E402


async def main(email: str, full_name: str, password: str) -> None:
    settings = get_settings()
    await init_beanie(database=AsyncIOMotorClient(settings.mongo_uri)[settings.mongo_db_name], document_models=[User])
    user = await User.find_one(User.email == email)
    if user:
        user.role, user.hashed_password = "admin", hash_password(password)
        await user.save()
        print(f"Updated {email} -> admin with the new password.")
    else:
        await User(email=email, full_name=full_name, hashed_password=hash_password(password), role="admin").insert()
        print(f"Created admin {email}.")


if __name__ == "__main__":
    if len(sys.argv) != 4 or len(sys.argv[3]) < 8:
        sys.exit("usage: create_admin.py EMAIL \"FULL NAME\" PASSWORD(min 8 chars)")
    asyncio.run(main(*sys.argv[1:]))
