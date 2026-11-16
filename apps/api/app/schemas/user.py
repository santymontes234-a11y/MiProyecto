import re
import uuid
from typing import Annotated

from pydantic import AfterValidator, Field

from app.models.enums import Role
from app.schemas.common import InputModel, OutputModel, UtcDatetime


def _password_policy(value: str) -> str:
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("La contraseña debe contener al menos una letra y un número")
    return value


Password = Annotated[str, Field(min_length=8, max_length=128), AfterValidator(_password_policy)]
FullName = Annotated[str, Field(min_length=1, max_length=120)]


class UserOut(OutputModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: UtcDatetime


class UserUpdate(InputModel):
    full_name: FullName | None = None


class PasswordChange(InputModel):
    current_password: str = Field(max_length=128)
    new_password: Password
