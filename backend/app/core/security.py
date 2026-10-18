"""Password hashing + JWT issuance/verification for real authentication.

Replaces the frontend's old fake "any non-empty field logs you in" flow.

Uses the `bcrypt` library directly rather than `passlib` — passlib is
unmaintained (last release 2020) and its bcrypt backend detection breaks
against modern bcrypt releases (AttributeError on `__about__`, then a
false-positive "password > 72 bytes" error from a broken self-test). This
sidesteps that entirely.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

_MAX_BCRYPT_BYTES = 72  # bcrypt's own hard limit; enforced explicitly so
                          # the error is clear instead of a truncation bug.


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > _MAX_BCRYPT_BYTES:
        raise ValueError(f"Password must be at most {_MAX_BCRYPT_BYTES} bytes.")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    """Returns the subject (user id) if the token is valid, else None."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except JWTError:
        return None
