import re
import uuid
from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from app.models.enums import Role, TransportMode, VehicleType
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
    email_verified: bool = False
    ranking_opt_in: bool = False


class UserUpdate(InputModel):
    full_name: FullName | None = None
    ranking_opt_in: bool | None = None


class Preferences(InputModel):
    language: Literal["es", "en"] = "es"
    default_mode: TransportMode | None = None
    weekly_goal_trips: int | None = Field(None, ge=1, le=100)
    email_notifications: bool = True
    default_vehicle_type: VehicleType | None = None


class PreferencesOut(OutputModel):
    language: str
    default_mode: TransportMode | None
    weekly_goal_trips: int | None
    email_notifications: bool
    default_vehicle_type: VehicleType | None


class AccountDelete(InputModel):
    password: str = Field(min_length=1, max_length=128)


class PasswordChange(InputModel):
    current_password: str = Field(max_length=128)
    new_password: Password
