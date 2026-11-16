from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Granularity, TransportMode
from app.schemas.common import UtcDatetime


class ModeBreakdown(BaseModel):
    mode: TransportMode
    trips_count: int
    distance_m: float
    co2_saved_g: float


class StatsSummary(BaseModel):
    from_: UtcDatetime | None = Field(None, alias="from")
    to: UtcDatetime | None = None
    trips_count: int
    distance_m: float
    duration_s: int
    co2_emitted_g: float
    co2_saved_g: float
    by_mode: list[ModeBreakdown]

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class TimeSeriesPoint(BaseModel):
    period_start: UtcDatetime
    trips_count: int
    distance_m: float
    co2_saved_g: float


class TimeSeries(BaseModel):
    granularity: Granularity
    points: list[TimeSeriesPoint]
