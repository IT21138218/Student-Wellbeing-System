from fastapi import APIRouter, Depends, File, UploadFile, status

from app.api.deps import get_current_user
from app.models.user import ChangePasswordIn, LoginIn, RegisterIn, TokenOut, UpdateProfileIn, User, UserOut
from app.services.auth_service import (
    authenticate_user, change_password, register_user, remove_avatar,
    to_user_out, update_avatar, update_profile,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
async def register(payload: RegisterIn) -> TokenOut:
    return await register_user(payload)


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn) -> TokenOut:
    return await authenticate_user(payload)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    """Who am I — used to refresh profile info without re-logging-in
    (e.g. after a page reload, or to confirm a stored token still works)."""
    return to_user_out(user)


@router.patch("/me", response_model=UserOut)
async def update_me(payload: UpdateProfileIn, user: User = Depends(get_current_user)) -> UserOut:
    return await update_profile(user, payload)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(payload: ChangePasswordIn, user: User = Depends(get_current_user)) -> None:
    await change_password(user, payload)


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user)) -> UserOut:
    return await update_avatar(user, file)


@router.delete("/me/avatar", response_model=UserOut)
async def delete_avatar(user: User = Depends(get_current_user)) -> UserOut:
    return await remove_avatar(user)
