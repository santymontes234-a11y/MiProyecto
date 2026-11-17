import uuid
from typing import Any

from pydantic import ConfigDict, Field

from app.models.enums import ReportFormat, ReportType, Role, TransportMode
from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.stats import ModeBreakdown


class UserStatusUpdate(InputModel):
    is_active: bool
    reason: str | None = Field(None, min_length=5, max_length=500)


class ReasonBody(InputModel):
    reason: str = Field(min_length=5, max_length=500)


class ReportCreate(InputModel):
    report_type: ReportType
    format: ReportFormat = ReportFormat.CSV
    from_: UtcDatetime | None = Field(None, alias="from")
    to: UtcDatetime | None = None

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, populate_by_name=True)


class ReportOut(OutputModel):
    id: uuid.UUID
    report_type: ReportType
    format: ReportFormat
    parameters: dict[str, Any]
    row_count: int
    created_by: uuid.UUID | None
    created_at: UtcDatetime


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
