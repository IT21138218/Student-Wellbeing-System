import base64

from fastapi import HTTPException, UploadFile, status

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import ChangePasswordIn, LoginIn, RegisterIn, TokenOut, UpdateProfileIn, User, UserOut

MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2MB — stored inline on the user doc, keep it small
ALLOWED_AVATAR_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _to_token_out(user: User) -> TokenOut:
    token = create_access_token(subject=str(user.id))
    return TokenOut(access_token=token, user=to_user_out(user))


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id), email=user.email, full_name=user.full_name, role=user.role,
        avatar_data_url=user.avatar_data_url, phone=user.phone, bio=user.bio,
        grade=user.grade, subject=user.subject, department=user.department,
        # Lets the frontend tell "parent with no children linked yet" without
        # a second call — see components/StudentPicker.jsx empty states.
        linked_student_ids=[str(i) for i in (user.linked_student_ids or [])],
        created_at=user.created_at,
    )


async def register_user(payload: RegisterIn) -> TokenOut:
    # Public sign-up must never mint an admin — admins are provisioned with
    # backend/scripts/create_admin.py.
    if payload.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot be self-registered. Ask an existing admin.",
        )
    existing = await User.find_one(User.email == payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    await user.insert()
    return _to_token_out(user)


async def authenticate_user(payload: LoginIn) -> TokenOut:
    user = await User.find_one(User.email == payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.")
    return _to_token_out(user)


async def update_profile(user: User, payload: UpdateProfileIn) -> UserOut:
    user.full_name = payload.full_name
    user.phone = payload.phone
    user.bio = payload.bio
    user.grade = payload.grade
    user.subject = payload.subject
    user.department = payload.department
    await user.save()
    return to_user_out(user)


async def change_password(user: User, payload: ChangePasswordIn) -> None:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect.")
    user.hashed_password = hash_password(payload.new_password)
    await user.save()


async def update_avatar(user: User, file: UploadFile) -> UserOut:
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type '{file.content_type}'. Use PNG, JPEG, WEBP, or GIF.",
        )
    data = await file.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image too large ({len(data) // 1024}KB) — max {MAX_AVATAR_BYTES // 1024}KB.",
        )
    encoded = base64.b64encode(data).decode("ascii")
    user.avatar_data_url = f"data:{file.content_type};base64,{encoded}"
    await user.save()
    return to_user_out(user)


async def remove_avatar(user: User) -> UserOut:
    user.avatar_data_url = None
    await user.save()
    return to_user_out(user)
