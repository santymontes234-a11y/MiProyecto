import uuid
from datetime import date
from typing import Annotated

from pydantic import Field, field_validator, model_validator

from app.models.enums import TransportMode, TripSource, TripStatus, VehicleType
from app.schemas.common import InputModel, OutputModel, UtcDatetime
from app.schemas.geo import LineStringGeometry

Occupants = Annotated[int, Field(ge=1, le=8)]


class _VehicleFields(InputModel):
    vehicle_type: VehicleType | None = None
    occupants: Occupants | None = None


class _RouteOrDistance(_VehicleFields):
    route: LineStringGeometry | None = None
    distance_m: float | None = Field(None, gt=0, le=1_000_000)

    @model_validator(mode="after")
    def _one_source(self) -> "_RouteOrDistance":
        if (self.route is None) == (self.distance_m is None):
            raise ValueError("Envía exactamente uno de: route o distance_m")
        return self


class TripEstimateRequest(_RouteOrDistance):
    mode: TransportMode


class TripEstimateBatchRequest(_RouteOrDistance):
    modes: list[TransportMode] = Field(min_length=1, max_length=7)

    @field_validator("modes")
    @classmethod
    def _unique(cls, v: list[TransportMode]) -> list[TransportMode]:
        if len(set(v)) != len(v):
            raise ValueError("modes no admite repetidos")
        return v


class TripEstimate(OutputModel):
    mode: TransportMode
    distance_m: float
    co2_emitted_g: float
    co2_saved_g: float
    emission_factor_g_per_km: float
    points_estimate: int
    vehicle_type: VehicleType | None = None
    occupants: int | None = None


class TripEstimateBatch(OutputModel):
    items: list[TripEstimate]


class TripCreate(_VehicleFields):
    client_trip_id: uuid.UUID
    mode: TransportMode
    started_at: UtcDatetime
    ended_at: UtcDatetime
    route: LineStringGeometry
    source: TripSource = TripSource.GPS
    route_token: str | None = Field(None, min_length=10, max_length=2048)

    @model_validator(mode="after")
    def _times(self) -> "TripCreate":
        if self.started_at.tzinfo is None or self.ended_at.tzinfo is None:
            raise ValueError("Las fechas deben incluir zona horaria")
        if self.ended_at <= self.started_at:
            raise ValueError("ended_at debe ser posterior a started_at")
        return self


class TripUpdate(_VehicleFields):
    mode: TransportMode | None = None
    status: TripStatus | None = None
    started_at: UtcDatetime | None = None
    ended_at: UtcDatetime | None = None
    route: LineStringGeometry | None = None
    source: TripSource | None = None
    route_token: str | None = Field(None, min_length=10, max_length=2048)


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
    source: TripSource
    recurrence_id: uuid.UUID | None
    points: int
    vehicle_type: VehicleType | None = None
    occupants: int | None = None


class AdminTripSummary(TripSummary):
    user_id: uuid.UUID


class TripOut(TripSummary):
    client_trip_id: uuid.UUID
    emission_factor_g_per_km: float
    route: LineStringGeometry
    created_at: UtcDatetime
    updated_at: UtcDatetime


class RecurringTripCreate(_VehicleFields):
    mode: TransportMode
    route: LineStringGeometry
    start_date: date
    end_date: date
    weekdays: list[Annotated[int, Field(ge=0, le=6)]] = Field(min_length=1, max_length=7)
    departure_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_s: int = Field(ge=60, le=86_400)
    utc_offset_minutes: int = Field(-360, ge=-720, le=840)

    @model_validator(mode="after")
    def _range(self) -> "RecurringTripCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date debe ser ≥ start_date")
        if (self.end_date - self.start_date).days > 365:
            raise ValueError("El rango máximo es de 366 días")
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("weekdays no admite repetidos")
        return self


class RecurringTripResult(OutputModel):
    recurrence_id: uuid.UUID
    created: int
    skipped_duplicates: int
    trip_ids: list[uuid.UUID]
