"""DTOs de /admin/analytics/* — API_CONTRACT 1.1.0 §13.

Equivalente TS: packages/shared/src/types/api-v1-1.ts. Si hay discrepancia, manda el contrato.
Convenciones: snake_case, metros, gramos, UTC ISO 8601, GeoJSON [lng, lat].
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import UtcDatetime

Dataset = Literal["official", "demo"]
Granularity = Literal["day", "week", "month"]


class AnalyticsMeta(BaseModel):
    from_: UtcDatetime = Field(serialization_alias="from")
    to: UtcDatetime
    modes: list[str] | None
    dataset: Dataset
    is_demo: bool  # true => datos sintéticos; nunca publicar como estadística
    min_users: int  # k-anonimato aplicado
    is_estimate: bool = True  # CO₂ y derivados son estimaciones, no mediciones
    bbox: tuple[float, float, float, float] | None = None
    notes: list[str] = []


class Feature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str | None = None
    geometry: dict[str, Any]
    properties: dict[str, Any]


class FeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[Feature]
    meta: AnalyticsMeta


# --- Indicadores -----------------------------------------------------------
class Co2Sensitivity(BaseModel):
    baseline_occupancy: float
    avoided_g: float


class ModeCo2Breakdown(BaseModel):
    mode: str
    trips_count: int
    users: int
    share_of_trips: float
    passenger_km: float
    reference_car_g: float
    mode_g: float
    avoided_g: float
    per_passenger_km_g: float | None
    vehicle_g_estimate: float | None
    vehicle_occupancy_assumed: float | None
    clamped_trips: int
    sensitivity: list[Co2Sensitivity]


class Co2Totals(BaseModel):
    trips_count: int
    passenger_km: float
    reference_car_g: float
    mode_g: float
    avoided_g: float
    clamped_trips: int


class AnalyticsSummary(BaseModel):
    trips_count: int
    active_users: int
    distance_m: float
    sustainable_trips: int
    sustainable_distance_m: float
    co2_emitted_g: float
    co2_saved_g: float
    co2: Co2Totals | None
    by_mode: list[ModeCo2Breakdown]
    suppressed: bool
    meta: AnalyticsMeta


class ModesResponse(BaseModel):
    items: list[ModeCo2Breakdown]
    meta: AnalyticsMeta


class PeakHour(BaseModel):
    hour: int = Field(ge=0, le=23)
    weekday: int | None = Field(None, ge=0, le=6)  # 0 = domingo … 6 = sábado
    trips_count: int
    co2_saved_g: float


class PeakHoursResponse(BaseModel):
    items: list[PeakHour]
    suppressed: bool
    timezone: str
    meta: AnalyticsMeta


class AnalyticsTimePoint(BaseModel):
    period_start: UtcDatetime
    trips_count: int
    distance_m: float
    co2_saved_g: float
    active_users: int


class AnalyticsTimeSeries(BaseModel):
    granularity: Granularity
    timezone: str
    points: list[AnalyticsTimePoint]
    suppressed: bool
    meta: AnalyticsMeta


class UsersGrowthPoint(BaseModel):
    period_start: UtcDatetime
    new_users: int
    total_users: int
    active_users: int


class UsersGrowth(BaseModel):
    granularity: Granularity
    timezone: str
    points: list[UsersGrowthPoint]
    meta: AnalyticsMeta


class InfrastructureSummary(BaseModel):
    pois_by_category: dict[str, int]
    pois_inactive: int
    cycleways_length_m: float
    cycleways_protected_length_m: float
    meta: AnalyticsMeta


class Co2Methodology(BaseModel):
    assumptions: dict[str, Any]
    units: dict[str, str]
    notes: list[str]
    meta: AnalyticsMeta


# --- Espacial ---------------------------------------------------------------
class HeatmapResponse(FeatureCollection):
    """Centroides de celda (Point [lng, lat]) con properties {weight, users}."""

    cell_m: float
    max_weight: int


class ZoneTrip(BaseModel):
    """Sin trazas ni user_id."""

    trip_id: uuid.UUID
    mode: str
    source: str
    started_at: UtcDatetime
    distance_m: float
    co2_saved_g: float
    relation: Literal["origin", "destination", "both"]


class ZoneTripsPage(BaseModel):
    items: list[ZoneTrip]
    total: int
    page: int
    page_size: int
    meta: AnalyticsMeta


class RouteCrossingRequest(BaseModel):
    geometry: dict[str, Any]
    buffer_m: float = Field(20, ge=0, le=500)


class RouteCrossing(BaseModel):
    trip_id: uuid.UUID
    mode: str
    started_at: UtcDatetime
    overlap_m: float


class RouteCrossingPage(BaseModel):
    items: list[RouteCrossing]
    total: int
    page: int
    page_size: int
    meta: AnalyticsMeta


class RouteOverlap(BaseModel):
    trip_a: uuid.UUID
    trip_b: uuid.UUID
    tolerance_m: float
    shared_m: float
    share_a: float
    share_b: float
    meta: AnalyticsMeta


class BikeLaneCoverageItem(BaseModel):
    mode: str
    trips_count: int
    covered_share: float  # fracción de la distancia a ≤ buffer_m de una ciclovía


class BikeLaneCoverage(BaseModel):
    buffer_m: float
    items: list[BikeLaneCoverageItem]
    meta: AnalyticsMeta


class DistanceResponse(BaseModel):
    distance_m: float
    method: Literal["geodesic"] = "geodesic"
    meta: AnalyticsMeta


class PriorityComponentSummary(BaseModel):
    key: str
    label: str
    kind: str
    weight: float


class PriorityResponse(FeatureCollection):
    infra: Literal["bike_lane", "bike_station", "bus_stop", "pedestrian"]
    profile_label: str
    config_version: str
    components: list[PriorityComponentSummary]
    notes: list[str]
