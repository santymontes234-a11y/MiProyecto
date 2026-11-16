from typing import Literal

from pydantic import EmailStr, Field

from app.schemas.common import InputModel, OutputModel
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
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut
