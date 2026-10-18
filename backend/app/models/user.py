from datetime import datetime, timezone
from typing import Literal

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, EmailStr, Field
from typing_extensions import Annotated

# admin = School Admin (always full access — see app/api/deps.py:require_roles),
# teacher, counselor, student, parent.
Role = Literal["admin", "teacher", "counselor", "student", "parent"]


class User(Document):
    email: Annotated[EmailStr, Indexed(unique=True)]
    full_name: str
    hashed_password: str
    role: Role = "student"
    avatar_data_url: str | None = None  # small image, stored inline (see MAX_AVATAR_BYTES)
    phone: str | None = None
    bio: str | None = None
    grade: str | None = None      # relevant for students
    subject: str | None = None    # relevant for teachers
    department: str | None = None  # relevant for counselor/admin
    # Parent -> child links. Only meaningful when role == "parent": a parent
    # may only run or read wellbeing check-ins for these student accounts
    # (enforced in app/services/student_service.py). Existing user documents
    # predate this field; Beanie supplies the default on read, so no migration.
    linked_student_ids: list[PydanticObjectId] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "users"


class UserName(BaseModel):
    """Projection: just id + full_name. Use with `.project(UserName)` whenever
    only a display name is needed — a full User can carry a ~2MB inline
    avatar, which is slow to pull from Atlas for a list of users."""

    id: PydanticObjectId = Field(alias="_id")
    full_name: str


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=8, max_length=128)
    role: Role = "student"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileIn(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    phone: str | None = Field(None, max_length=30)
    bio: str | None = Field(None, max_length=280)
    grade: str | None = Field(None, max_length=30)
    subject: str | None = Field(None, max_length=60)
    department: str | None = Field(None, max_length=60)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    avatar_data_url: str | None = None
    phone: str | None = None
    bio: str | None = None
    grade: str | None = None
    subject: str | None = None
    department: str | None = None
    linked_student_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class StudentOption(BaseModel):
    """A registered student account, for staff-facing pickers.

    Deliberately excludes avatar_data_url: avatars are inline base64 up to
    2MB each (auth_service.MAX_AVATAR_BYTES) and this is a list endpoint —
    the picker renders initials from full_name instead.
    """

    id: str
    full_name: str
    email: EmailStr
    grade: str | None = None  # a string like "Grade 10", not the CSV cohort's int grade
    has_avatar: bool = False


class ParentOption(BaseModel):
    """A parent account plus the children linked to it, for the admin
    Manage Guardians screen."""

    id: str
    full_name: str
    email: EmailStr
    linked_student_ids: list[str] = Field(default_factory=list)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
