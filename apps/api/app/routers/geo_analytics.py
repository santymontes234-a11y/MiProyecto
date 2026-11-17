"""/admin/analytics/* — analítica geoespacial (API_CONTRACT 1.1.0 §13, rol ADMIN).

Montaje (Backend, app/main.py): ``app.include_router(geo_analytics.router, prefix=api_prefix)``.
Los routers no construyen SQL: delegan en app/services/geo_analytics.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, require_permission
from app.core.errors import AppError
from app.models import TransportMode
from app.schemas.geo import parse_bbox
from app.schemas.geo_analytics import (
    AnalyticsMeta,
    AnalyticsSummary,
    AnalyticsTimeSeries,
    BikeLaneCoverage,
    Co2Methodology,
    DistanceResponse,
    Feature,
    FeatureCollection,
    Granularity,
    HeatmapResponse,
    InfrastructureSummary,
    ModesResponse,
    PeakHoursResponse,
    PriorityResponse,
    RouteCrossingPage,
    RouteCrossingRequest,
    RouteOverlap,
    UsersGrowth,
    ZoneTripsPage,
)
from app.services.geo_analytics import analytics, emissions, priority_index, repository
from app.services.geo_analytics.filters import AnalyticsFilters, Dataset, build_filters
from app.services.geo_analytics.osm_import import DEFAULT_BBOX

router = APIRouter(
    prefix="/admin/analytics",
    tags=["admin-analytics"],
    dependencies=[Depends(require_permission("analytics:read"))],  # Anexo A
)

DEMO_NOTE = "DATOS DEMO SINTÉTICOS: no representan la movilidad real de Querétaro."
BBox = tuple[float, float, float, float]


def get_filters(
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
    mode: Annotated[list[TransportMode] | None, Query()] = None,
    dataset: Annotated[Dataset, Query()] = "official",
) -> AnalyticsFilters:
    return build_filters(date_from, date_to, [m.value for m in mode] if mode else None, dataset)


Filters = Annotated[AnalyticsFilters, Depends(get_filters)]
BBoxQ = Annotated[str, Query(description="minLng,minLat,maxLng,maxLat (máx. 0.5°×0.5°)")]
CellM = Annotated[float, Query(ge=100, le=5000)]
ZoneKind = Literal["colonia", "ageb", "municipio", "distrito", "custom"]
Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _meta(f: AnalyticsFilters, *notes: str, bbox: BBox | None = None) -> AnalyticsMeta:
    n = list(notes) + ([DEMO_NOTE] if f.is_demo else [])
    return AnalyticsMeta(**{**f.meta(), "from_": f.date_from}, bbox=bbox, notes=n)


def _props(r: dict[str, Any]) -> dict[str, Any]:
    out = {("trips_count" if k == "trips" else k): v for k, v in r.items()}
    return {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in out.items()}


def _fc(
    rows: list[dict[str, Any]],
    f: AnalyticsFilters,
    id_key: str | None,
    *notes: str,
    bbox: BBox | None = None,
) -> FeatureCollection:
    feats = []
    for r in rows:
        geom = r.pop("geometry")
        fid = str(r[id_key]) if id_key else None
        feats.append(Feature(id=fid, geometry=geom, properties=_props(r)))
    return FeatureCollection(features=feats, meta=_meta(f, *notes, bbox=bbox))


def _position(raw: str, name: str) -> tuple[float, float]:
    try:
        lng, lat = (float(x) for x in raw.split(","))
    except ValueError:
        raise AppError(400, "BAD_REQUEST", f"{name} debe ser lng,lat") from None
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        raise AppError(400, "BAD_REQUEST", f"{name} fuera de rango")
    return lng, lat


# ---------------------------------------------------------------------------
# Indicadores
# ---------------------------------------------------------------------------
@router.get("/summary", response_model=AnalyticsSummary, response_model_by_alias=True)
def summary(db: DB, f: Filters) -> AnalyticsSummary:
    return AnalyticsSummary(**analytics.summary(db, f), meta=_meta(f))


@router.get("/modes", response_model=ModesResponse, response_model_by_alias=True)
def modes(db: DB, f: Filters) -> ModesResponse:
    return ModesResponse(items=analytics.modes(db, f), meta=_meta(f))


@router.get("/peak-hours", response_model=PeakHoursResponse, response_model_by_alias=True)
def peak_hours(db: DB, f: Filters, by_weekday: bool = False) -> PeakHoursResponse:
    r = analytics.peak_hours(db, f, by_weekday)
    notes = [r["note"]] + (["weekday: 0 = domingo … 6 = sábado"] if by_weekday else [])
    return PeakHoursResponse(
        items=r["items"], suppressed=r["suppressed"], timezone=r["timezone"], meta=_meta(f, *notes)
    )


@router.get("/timeseries", response_model=AnalyticsTimeSeries, response_model_by_alias=True)
def timeseries(db: DB, f: Filters, granularity: Granularity = "month") -> AnalyticsTimeSeries:
    return AnalyticsTimeSeries(**analytics.timeseries(db, f, granularity), meta=_meta(f))


@router.get("/users-growth", response_model=UsersGrowth, response_model_by_alias=True)
def users_growth(db: DB, f: Filters, granularity: Granularity = "month") -> UsersGrowth:
    points = repository.users_growth(db, f, granularity)
    note = (
        "DEMO: alta = primer viaje sintético del usuario."
        if f.is_demo
        else "Alta = creación de la cuenta; activos = usuarios con al menos un viaje en el periodo."
    )
    return UsersGrowth(
        granularity=granularity, timezone=analytics.TZ, points=points, meta=_meta(f, note)
    )


@router.get("/infrastructure", response_model=InfrastructureSummary, response_model_by_alias=True)
def infrastructure(db: DB, f: Filters, bbox: str | None = None) -> InfrastructureSummary:
    area = parse_bbox(bbox) if bbox else DEFAULT_BBOX
    data = repository.infrastructure(db, area, f.is_demo)
    note = (
        "Infraestructura registrada en la plataforma (OSM y altas de administración); "
        "puede estar incompleta. Datos OSM © OpenStreetMap contributors (ODbL)."
    )
    return InfrastructureSummary(**data, meta=_meta(f, note, bbox=area))


@router.get("/co2-methodology", response_model=Co2Methodology, response_model_by_alias=True)
def co2_methodology(f: Filters) -> Co2Methodology:
    m = emissions.methodology()
    return Co2Methodology(
        assumptions={
            "version": m["assumptions_version"],
            "factor_source": m["factor_source"],
            "vehicle_occupancy": m["vehicle_occupancy"],
            "baseline_occupancy_scenarios": m["baseline_occupancy_scenarios"],
        },
        units=m["units"],
        notes=m["notes"],
        meta=_meta(f),
    )


# ---------------------------------------------------------------------------
# Zonas y flujos
# ---------------------------------------------------------------------------
@router.get("/zones", response_model=FeatureCollection, response_model_by_alias=True)
def zones(db: DB, f: Filters, kind: ZoneKind | None = None) -> FeatureCollection:
    return _fc(
        repository.trips_by_zone(db, f, kind),
        f,
        "zone_id",
        "Zonas con menos de min_users usuarios distintos se omiten.",
    )


@router.get("/zones/{zone_id}/trips", response_model=ZoneTripsPage, response_model_by_alias=True)
def zone_trips(
    db: DB,
    f: Filters,
    zone_id: uuid.UUID,
    relation: Literal["origin", "destination", "both", "any"] = "any",
    page: Page = 1,
    page_size: PageSize = 20,
) -> ZoneTripsPage:
    items, total = repository.zone_trips(db, zone_id, relation, f, page, page_size)
    return ZoneTripsPage(items=items, total=total, page=page, page_size=page_size, meta=_meta(f))


@router.get("/od-flows", response_model=FeatureCollection, response_model_by_alias=True)
def od_flows(
    db: DB,
    f: Filters,
    kind: ZoneKind | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> FeatureCollection:
    rows = repository.od_flows(db, f, kind, limit)
    return _fc(rows, f, None, "Líneas de deseo entre zonas, no trazas reales.")


# ---------------------------------------------------------------------------
# Cuadrículas, mapa de calor, corredores
# ---------------------------------------------------------------------------
@router.get("/grid", response_model=FeatureCollection, response_model_by_alias=True)
def grid(
    db: DB,
    f: Filters,
    bbox: BBoxQ,
    cell_m: CellM = 500,
    metric: Literal["origin", "destination", "route"] = "origin",
    shape: Literal["square", "hex"] = "hex",
) -> FeatureCollection:
    area = parse_bbox(bbox)
    rows = repository.grid_counts(db, area, cell_m, metric, shape, f)
    return _fc(rows, f, None, "Celdas con menos de min_users usuarios se omiten.", bbox=area)


@router.get("/heatmap", response_model=HeatmapResponse, response_model_by_alias=True)
def heatmap(
    db: DB,
    f: Filters,
    bbox: BBoxQ,
    cell_m: CellM = 250,
    point: Literal["origin", "destination", "both"] = "both",
) -> HeatmapResponse:
    area = parse_bbox(bbox)
    rows = repository.point_density(db, area, cell_m, point, f)
    feats = [
        Feature(
            geometry={"type": "Point", "coordinates": [round(r["lon"], 6), round(r["lat"], 6)]},
            properties={"weight": int(r["weight"]), "users": int(r["users"])},
        )
        for r in rows
    ]
    return HeatmapResponse(
        features=feats,
        cell_m=cell_m,
        max_weight=max((int(r["weight"]) for r in rows), default=0),
        meta=_meta(f, "Centroides de celda agregados; nunca coordenadas individuales.", bbox=area),
    )


@router.get("/corridors", response_model=FeatureCollection, response_model_by_alias=True)
def corridors(
    db: DB,
    f: Filters,
    bbox: BBoxQ,
    cell_m: CellM = 300,
    quantile: Annotated[float, Query(gt=0.5, lt=1)] = 0.9,
    min_cells: Annotated[int, Query(ge=2, le=200)] = 3,
) -> FeatureCollection:
    area = parse_bbox(bbox)
    rows = repository.corridors(db, area, cell_m, quantile, min_cells, f)
    return _fc(
        rows,
        f,
        "corridor_id",
        "Corredor = celdas contiguas con densidad de rutas >= cuantil indicado del área.",
        bbox=area,
    )


@router.get("/bike-lane-coverage", response_model=BikeLaneCoverage, response_model_by_alias=True)
def bike_lane_coverage(
    db: DB, f: Filters, buffer_m: Annotated[float, Query(ge=5, le=100)] = 15
) -> BikeLaneCoverage:
    rows = repository.bike_lane_coverage(db, f, buffer_m)
    items = [
        {
            "mode": r["mode_code"],
            "trips_count": int(r["trips_with_route"]),
            "covered_share": round(float(r["share_on_bike_lanes"] or 0), 4),
        }
        for r in rows
    ]
    return BikeLaneCoverage(buffer_m=buffer_m, items=items, meta=_meta(f))


# ---------------------------------------------------------------------------
# Intersección de rutas y distancias
# ---------------------------------------------------------------------------
@router.post("/route-crossings", response_model=RouteCrossingPage, response_model_by_alias=True)
def route_crossings(
    db: DB, f: Filters, body: RouteCrossingRequest, page: Page = 1, page_size: PageSize = 20
) -> RouteCrossingPage:
    if body.geometry.get("type") not in ("Point", "LineString", "Polygon", "MultiPolygon"):
        raise AppError(400, "BAD_REQUEST", "geometry debe ser Point, LineString o (Multi)Polygon")
    rows, total = repository.trips_crossing(db, body.geometry, body.buffer_m, f, page, page_size)
    items = [
        {
            "trip_id": r["trip_id"],
            "mode": r["mode_code"],
            "started_at": r["started_at"],
            "overlap_m": round(float(r["length_inside_m"] or 0), 1),
        }
        for r in rows
    ]
    return RouteCrossingPage(
        items=items, total=total, page=page, page_size=page_size, meta=_meta(f)
    )


@router.get("/route-overlap", response_model=RouteOverlap, response_model_by_alias=True)
def route_overlap(
    db: DB,
    f: Filters,
    trip_a: uuid.UUID,
    trip_b: uuid.UUID,
    tolerance_m: Annotated[float, Query(ge=0, le=100)] = 15,
) -> RouteOverlap:
    r = repository.route_overlap(db, trip_a, trip_b, tolerance_m)
    if r is None:
        raise AppError(404, "TRIP_NOT_FOUND", "Viaje no encontrado")
    return RouteOverlap(
        trip_a=trip_a,
        trip_b=trip_b,
        tolerance_m=tolerance_m,
        shared_m=round(float(r["shared_m"] or 0), 1),
        share_a=round(float(r["share_of_a"] or 0), 4),
        share_b=round(float(r["share_of_b"] or 0), 4),
        meta=_meta(f),
    )


@router.get("/distance", response_model=DistanceResponse, response_model_by_alias=True)
def distance(
    db: DB,
    f: Filters,
    origin: Annotated[str, Query(description="lng,lat")],
    destination: Annotated[str, Query(description="lng,lat")],
) -> DistanceResponse:
    d = repository.distance_m(
        db, _position(origin, "origin"), _position(destination, "destination")
    )
    return DistanceResponse(distance_m=round(d, 1), meta=_meta(f))


# ---------------------------------------------------------------------------
# Índice de prioridad de infraestructura
# ---------------------------------------------------------------------------
_PRIORITY_KEYS = (
    "score",
    "label",
    "confidence",
    "sample",
    "demand_share",
    "components",
    "explanation",
)


@router.get(
    "/infrastructure-priority", response_model=PriorityResponse, response_model_by_alias=True
)
def infrastructure_priority(
    db: DB,
    f: Filters,
    bbox: BBoxQ,
    infra: Literal["bike_lane", "bike_station", "bus_stop", "pedestrian"] = "bike_lane",
    cell_m: CellM = 500,
) -> PriorityResponse:
    area = parse_bbox(bbox)
    cfg = priority_index.load_config()
    res = priority_index.score_cells(repository.priority_inputs(db, area, cell_m, f), infra, cfg)
    feats = [
        Feature(
            id=f"{c['cell_i']}:{c['cell_j']}",
            geometry=c["geometry"],
            properties={k: c[k] for k in _PRIORITY_KEYS},
        )
        for c in res["cells"]
    ]
    meta = _meta(
        f,
        "Puntaje relativo al área analizada: identifica candidatas a estudio técnico, "
        "no necesidades confirmadas. Ver notas de limitaciones.",
        bbox=area,
    )
    return PriorityResponse(
        features=feats,
        meta=meta,
        infra=infra,
        profile_label=res["profile_label"],
        config_version=res["config_version"],
        components=[
            {"key": c["key"], "label": c["label"], "kind": c["kind"], "weight": c["weight"]}
            for c in res["components"]
        ],
        notes=res["notes"],
    )
