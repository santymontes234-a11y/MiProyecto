import uuid

from pydantic import Field, model_validator

from app.models.enums import TransportMode, TripStatus
from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.geo import LineStringGeometry


class TripEstimateRequest(InputModel):
    mode: TransportMode
    route: LineStringGeometry | None = None
    distance_m: float | None = Field(None, gt=0, le=1_000_000)

    @model_validator(mode="after")
    def _one_source(self) -> "TripEstimateRequest":
        if (self.route is None) == (self.distance_m is None):
            raise ValueError("Envía exactamente uno de: route o distance_m")
        return self


class TripEstimate(OutputModel):
    mode: TransportMode
    distance_m: float
    co2_emitted_g: float
    co2_saved_g: float
    emission_factor_g_per_km: float


class TripCreate(InputModel):
    client_trip_id: uuid.UUID
    mode: TransportMode
    started_at: UtcDatetime
    ended_at: UtcDatetime
    route: LineStringGeometry

    @model_validator(mode="after")
    def _times(self) -> "TripCreate":
        if self.started_at.tzinfo is None or self.ended_at.tzinfo is None:
            raise ValueError("Las fechas deben incluir zona horaria")
        if self.ended_at <= self.started_at:
            raise ValueError("ended_at debe ser posterior a started_at")
        return self


class TripSummary(OutputModel):
    id: uuid.UUID
    mode: TransportMode
    status: TripStatus
    started_at: UtcDatetime
    ended_at: UtcDatetime
    distance_m: float
    duration_s: int
    co2_emitted_g: float
    co2_saved_g: float


class TripOut(TripSummary):
    client_trip_id: uuid.UUID
    emission_factor_g_per_km: float
    route: LineStringGeometry
    created_at: UtcDatetime
