import uuid
from typing import Literal

from pydantic import EmailStr, Field

from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.user import FullName, Password, UserOut


class RegisterRequest(InputModel):
    email: EmailStr
    password: Password
    full_name: FullName


class LoginRequest(InputModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(InputModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


class TokenPair(OutputModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_in: int
    user: UserOut


class EmailRequest(InputModel):
    email: EmailStr


class TokenConfirm(InputModel):
    token: str = Field(min_length=20, max_length=256)


class PasswordResetConfirm(InputModel):
    token: str = Field(min_length=20, max_length=256)
    new_password: Password


class MessageResponse(OutputModel):
    message: str


class SessionOut(OutputModel):
    id: uuid.UUID
    created_at: UtcDatetime
    last_used_at: UtcDatetime
    expires_at: UtcDatetime
    user_agent: str | None
    current: bool
