"""Auth dependencies: who is calling, and are they allowed to.

Nothing in this API required a valid token before this file existed —
every ML endpoint was reachable by anyone. This adds real enforcement.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated — missing bearer token.")
    user_id = decode_access_token(creds.credentials)
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token.")
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists.")
    return user


async def get_current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User | None:
    """Like get_current_user, but returns None instead of 401 when there's no
    (or a bad) token. For endpoints that serve public data by default and
    only gate a specific branch — currently GET /forecast/students, whose
    CSV listing must stay reachable from the unauthenticated home page while
    its ?source=real branch is gated."""
    if creds is None:
        return None
    user_id = decode_access_token(creds.credentials)
    if not user_id:
        return None
    return await User.get(user_id)


def require_roles(*allowed: str):
    """Dependency factory: 403s unless the caller's role is in `allowed`.
    'admin' is ALWAYS allowed regardless of what's passed — this is the
    fix for the "admin should have full access everywhere" gap: every
    call site only has to declare which non-admin roles it permits.
    """
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role != "admin" and user.role not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Role '{user.role}' cannot access this — allowed: admin, {', '.join(allowed)}.",
            )
        return user
    return checker
