import uuid
from typing import Any

from pydantic import Field

from app.models.enums import Role, TransportMode
from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.stats import ModeBreakdown


class UserStatusUpdate(InputModel):
    is_active: bool


class UserRoleUpdate(InputModel):
    role: Role


class AdminOverview(OutputModel):
    users_total: int
    users_active_30d: int
    trips_total: int
    co2_saved_g: float
    distance_m: float
    by_mode: list[ModeBreakdown]


class EmissionFactorOut(OutputModel):
    mode: TransportMode
    grams_per_km: float
    valid_from: UtcDatetime
    updated_by: uuid.UUID | None


class EmissionFactorUpdate(InputModel):
    grams_per_km: float = Field(ge=0, le=5000)


class AuditLogOut(OutputModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    payload: dict[str, Any]
    created_at: UtcDatetime
