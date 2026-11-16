"""/admin/analytics/* — analítica geoespacial (rol ADMIN).

⚠️ PROPUESTA, NO MONTADO: estas rutas no están en API_CONTRACT v1.0. No incluir
este router en la app hasta que el architect publique el contrato 1.1.0
(docs/proposals/2026-11-15-geo-analytics.md). Entonces:

    from app.routers import geo_analytics
    api.include_router(geo_analytics.router)

Los routers no construyen SQL: delegan en app/services/geo_analytics.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, require_role
from app.core.errors import AppError
from app.models import Role, TransportMode
from app.schemas.geo import parse_bbox
from app.schemas.geo_analytics import (
    AnalyticsMeta,
    AnalyticsSummary,
    AnalyticsTimeSeries,
    BikeLaneCoverage,
    Distance,
    Feature,
    FeatureCollection,
    HeatmapResponse,
    ModesResponse,
    PeakHoursResponse,
    PriorityResponse,
    RouteCrossingPage,
    RouteCrossingRequest,
    RouteOverlap,
    ZoneTripsPage,
)
from app.services.geo_analytics import analytics, emissions, priority_index, repository
from app.services.geo_analytics.filters import AnalyticsFilters, Dataset, build_filters

router = APIRouter(
    prefix="/admin/analytics",
    tags=["admin-analytics"],
    dependencies=[Depends(require_role(Role.ADMIN))],
)

DEMO_NOTE = "DATOS DEMO SINTÉTICOS: no representan la movilidad real de Querétaro."


def get_filters(
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
    mode: Annotated[list[TransportMode] | None, Query()] = None,
    dataset: Annotated[Dataset, Query()] = "official",
) -> AnalyticsFilters:
    return build_filters(date_from, date_to, [m.value for m in mode] if mode else None, dataset)


Filters = Annotated[AnalyticsFilters, Depends(get_filters)]
BBoxQ = Annotated[str, Query(description="minLng,minLat,maxLng,maxLat (máx. 0.5°×0.5°)")]


def _meta(f: AnalyticsFilters, *notes: str) -> AnalyticsMeta:
    n = list(notes) + ([DEMO_NOTE] if f.is_demo else [])
    return AnalyticsMeta(**{**f.meta(), "from_": f.date_from}, notes=n)


def _fc(
    rows: list[dict[str, Any]], f: AnalyticsFilters, id_key: str | None, *notes: str
) -> FeatureCollection:
    feats = []
    for r in rows:
        geom = r.pop("geometry")
        fid = str(r[id_key]) if id_key else None
        feats.append(Feature(id=fid, geometry=geom, properties=_rename(r)))
    return FeatureCollection(features=feats, meta=_meta(f, *notes))


def _rename(r: dict[str, Any]) -> dict[str, Any]:
    """Nombres del contrato: `trips` -> `trips_count`, valores serializables."""
    out = {("trips_count" if k == "trips" else k): v for k, v in r.items()}
    return {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in out.items()}


def _point(raw: str, name: str) -> tuple[float, float]:
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
    return PeakHoursResponse(
        items=r["items"],
        suppressed=r["suppressed"],
        timezone=r["timezone"],
        meta=_meta(f, r["note"]),
    )


@router.get("/timeseries", response_model=AnalyticsTimeSeries, response_model_by_alias=True)
def timeseries(
    db: DB, f: Filters, granularity: Literal["day", "week", "month"] = "month"
) -> AnalyticsTimeSeries:
    return AnalyticsTimeSeries(**analytics.timeseries(db, f, granularity), meta=_meta(f))


@router.get("/co2-methodology")
def co2_methodology() -> dict[str, Any]:
    return emissions.methodology()


# ---------------------------------------------------------------------------
# Zonas y flujos
# ---------------------------------------------------------------------------
ZoneKind = Literal["colonia", "ageb", "municipio", "distrito", "custom"]


@router.get("/zones", response_model=FeatureCollection, response_model_by_alias=True)
def zones(db: DB, f: Filters, zone_kind: ZoneKind | None = None) -> FeatureCollection:
    return _fc(
        repository.trips_by_zone(db, f, zone_kind),
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
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ZoneTripsPage:
    items, total = repository.trips_in_zone(db, zone_id, relation, f, page, page_size)
    return ZoneTripsPage(items=items, total=total, page=page, page_size=page_size, meta=_meta(f))


@router.get("/od-flows", response_model=FeatureCollection, response_model_by_alias=True)
def od_flows(
    db: DB,
    f: Filters,
    zone_kind: ZoneKind | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> FeatureCollection:
    rows = repository.od_flows(db, f, zone_kind, limit)
    return _fc(rows, f, None, "Líneas de deseo entre centroides de zona, no trazas reales.")


# ---------------------------------------------------------------------------
# Cuadrículas, mapa de calor, corredores
# ---------------------------------------------------------------------------
CellM = Annotated[float, Query(ge=100, le=5000)]


@router.get("/grid", response_model=FeatureCollection, response_model_by_alias=True)
def grid(
    db: DB,
    f: Filters,
    bbox: BBoxQ,
    cell_m: CellM = 500,
    metric: Literal["origin", "destination", "route"] = "origin",
    shape: Literal["square", "hex"] = "hex",
) -> FeatureCollection:
    rows = repository.grid_counts(db, parse_bbox(bbox), cell_m, metric, shape, f)
    return _fc(rows, f, None, "Celdas con menos de min_users usuarios distintos se omiten.")


@router.get("/heatmap", response_model=HeatmapResponse, response_model_by_alias=True)
def heatmap(
    db: DB,
    f: Filters,
    bbox: BBoxQ,
    cell_m: CellM = 250,
    point: Literal["origin", "destination", "both"] = "both",
) -> HeatmapResponse:
    rows = repository.point_density(db, parse_bbox(bbox), cell_m, point, f)
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
        meta=_meta(f, "Centroides de celda agregados; nunca coordenadas individuales."),
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
    rows = repository.corridors(db, parse_bbox(bbox), cell_m, quantile, min_cells, f)
    return _fc(
        rows,
        f,
        "corridor_id",
        "Corredor = celdas contiguas con densidad de rutas >= cuantil indicado del área.",
    )


@router.get("/bike-lane-coverage", response_model=BikeLaneCoverage, response_model_by_alias=True)
def bike_lane_coverage(
    db: DB, f: Filters, buffer_m: Annotated[float, Query(ge=5, le=100)] = 15
) -> BikeLaneCoverage:
    rows = repository.bike_lane_coverage(db, f, buffer_m)
    items = [
        {**{k: v for k, v in r.items() if k != "mode_code"}, "mode": r["mode_code"]} for r in rows
    ]
    return BikeLaneCoverage(buffer_m=buffer_m, items=items, meta=_meta(f))


# ---------------------------------------------------------------------------
# Intersección de rutas y distancias
# ---------------------------------------------------------------------------
@router.post("/route-crossings", response_model=RouteCrossingPage, response_model_by_alias=True)
def route_crossings(
    db: DB,
    f: Filters,
    body: RouteCrossingRequest,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> RouteCrossingPage:
    geom = body.geometry if isinstance(body.geometry, dict) else body.geometry.model_dump()
    if geom.get("type") not in ("Point", "LineString", "Polygon", "MultiPolygon"):
        raise AppError(400, "BAD_REQUEST", "geometry debe ser Point, LineString o (Multi)Polygon")
    items, total = repository.trips_crossing(db, geom, body.buffer_m, f, page, page_size)
    return RouteCrossingPage(
        items=items, total=total, page=page, page_size=page_size, meta=_meta(f)
    )


@router.get("/route-overlap", response_model=RouteOverlap)
def route_overlap(
    db: DB,
    trip_a: uuid.UUID,
    trip_b: uuid.UUID,
    tolerance_m: Annotated[float, Query(ge=0, le=100)] = 15,
) -> RouteOverlap:
    r = repository.route_overlap(db, trip_a, trip_b, tolerance_m)
    if r is None:
        raise AppError(404, "TRIP_NOT_FOUND", "Viaje no encontrado")
    return RouteOverlap(**r)


@router.get("/distance", response_model=Distance)
def distance(
    db: DB,
    from_: Annotated[str, Query(alias="from", description="lng,lat")],
    to: Annotated[str, Query(description="lng,lat")],
) -> Distance:
    return Distance(
        distance_m=round(repository.distance_m(db, _point(from_, "from"), _point(to, "to")), 1)
    )


# ---------------------------------------------------------------------------
# Índice de prioridad de infraestructura
# ---------------------------------------------------------------------------
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
    cfg = priority_index.load_config()
    cells = repository.priority_inputs(db, parse_bbox(bbox), cell_m, f)
    res = priority_index.score_cells(cells, infra, cfg)
    feats = [
        Feature(id=f"{c['cell_i']}:{c['cell_j']}", geometry=c.pop("geometry"), properties=c)
        for c in res.pop("cells")
    ]
    meta = _meta(
        f,
        "Puntaje relativo al área analizada: identifica candidatas a estudio técnico, "
        "no necesidades confirmadas. Ver notas de limitaciones.",
    )
    return PriorityResponse(features=feats, meta=meta, **res)
