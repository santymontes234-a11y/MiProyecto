"""Acceso a las funciones PostGIS del esquema `geo` (apps/api/db/geo/*.sql).

Solo este módulo construye SQL del módulo geo (ARCHITECTURE.md §4: los routers
no construyen SQL). Todas las consultas son parametrizadas; los identificadores
dinámicos se resuelven dentro de PostgreSQL con listas blancas.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.services.geo_analytics.filters import MIN_USERS, AnalyticsFilters

BBox = tuple[float, float, float, float]

_SQLSTATE_ERRORS = {
    "22023": (400, "BAD_REQUEST"),  # parámetro inválido (bbox, métrica…)
    "54000": (400, "GRID_TOO_LARGE"),  # demasiadas celdas
    "P0002": (404, "ZONE_NOT_FOUND"),
}


@contextmanager
def _sql_errors(db: Session) -> Iterator[None]:
    """Traduce los RAISE de las funciones SQL al formato de error del contrato."""
    try:
        yield
    except DBAPIError as exc:
        db.rollback()
        state = getattr(exc.orig, "sqlstate", None)
        if state in _SQLSTATE_ERRORS:
            status, code = _SQLSTATE_ERRORS[state]
            diag = getattr(exc.orig, "diag", None)
            msg = getattr(diag, "message_primary", None) or "Parámetros inválidos"
            raise AppError(status, code, msg) from None
        raise


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    with _sql_errors(db):
        result = db.execute(text(sql), params)
        return [dict(r) for r in result.mappings().all()]


def _geojson(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


def _bbox_params(bbox: BBox) -> dict[str, float]:
    return {"xmin": bbox[0], "ymin": bbox[1], "xmax": bbox[2], "ymax": bbox[3]}


# Interpolado en SQL: solo placeholders de parámetros (motivo de los noqa S608).
_F = (
    "CAST(:f AS timestamptz), CAST(:t AS timestamptz), "
    "CAST(:modes AS text[]), CAST(:demo AS boolean)"
)


# ---------------------------------------------------------------------------
# Zonas y flujos
# ---------------------------------------------------------------------------
def trips_by_zone(db: Session, f: AnalyticsFilters, zone_kind: str | None) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        f"""
        SELECT r.*, ST_AsGeoJSON(z.geom, 6) AS geometry
        FROM geo.trips_by_zone(CAST(:kind AS text), {_F}, :k) r
        JOIN geo.v_zones z ON z.id = r.zone_id
    """,  # noqa: S608
        {**f.params(), "kind": zone_kind, "k": MIN_USERS},
    )
    for r in rows:
        r["geometry"] = _geojson(r["geometry"])
    return rows


def od_flows(
    db: Session, f: AnalyticsFilters, zone_kind: str | None, limit: int
) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        f"""
        SELECT origin_zone_id, origin_zone_name, destination_zone_id, destination_zone_name,
               trips, users, avg_distance_m, ST_AsGeoJSON(geom, 6) AS geometry
        FROM geo.od_flows(CAST(:kind AS text), {_F}, :k, :lim)
    """,  # noqa: S608
        {**f.params(), "kind": zone_kind, "k": MIN_USERS, "lim": limit},
    )
    for r in rows:
        r["geometry"] = _geojson(r["geometry"])
    return rows


def trips_in_zone(
    db: Session, zone_id: uuid.UUID, relation: str, f: AnalyticsFilters, page: int, page_size: int
) -> tuple[list[dict[str, Any]], int]:
    rows = _rows(
        db,
        f"""
        SELECT * FROM geo.trips_in_zone(CAST(:zone AS uuid), :rel, {_F}, :lim, :off)
    """,  # noqa: S608
        {
            **f.params(),
            "zone": str(zone_id),
            "rel": relation,
            "lim": page_size,
            "off": (page - 1) * page_size,
        },
    )
    total = int(rows[0]["total_count"]) if rows else 0
    for r in rows:
        r.pop("total_count", None)
    return rows, total


# ---------------------------------------------------------------------------
# Intersección de rutas y distancias
# ---------------------------------------------------------------------------
def trips_crossing(
    db: Session,
    geometry: dict[str, Any],
    buffer_m: float,
    f: AnalyticsFilters,
    page: int,
    page_size: int,
) -> tuple[list[dict[str, Any]], int]:
    rows = _rows(
        db,
        f"""
        SELECT * FROM geo.trips_crossing(ST_GeomFromGeoJSON(:g), :buf, {_F}, :lim, :off)
    """,  # noqa: S608
        {
            **f.params(),
            "g": json.dumps(geometry),
            "buf": buffer_m,
            "lim": page_size,
            "off": (page - 1) * page_size,
        },
    )
    total = int(rows[0]["total_count"]) if rows else 0
    for r in rows:
        r.pop("total_count", None)
    return rows, total


def route_overlap(
    db: Session, trip_a: uuid.UUID, trip_b: uuid.UUID, tolerance_m: float
) -> dict[str, Any] | None:
    rows = _rows(
        db,
        "SELECT * FROM geo.route_overlap(CAST(:a AS uuid), CAST(:b AS uuid), :tol)",
        {"a": str(trip_a), "b": str(trip_b), "tol": tolerance_m},
    )
    return rows[0] if rows else None


def bike_lane_coverage(db: Session, f: AnalyticsFilters, buffer_m: float) -> list[dict[str, Any]]:
    return _rows(
        db, f"SELECT * FROM geo.bike_lane_coverage(:buf, {_F})", {**f.params(), "buf": buffer_m}  # noqa: S608
    )


def distance_m(db: Session, a: tuple[float, float], b: tuple[float, float]) -> float:
    rows = _rows(
        db,
        "SELECT geo.distance_m(:x1, :y1, :x2, :y2) AS d",
        {"x1": a[0], "y1": a[1], "x2": b[0], "y2": b[1]},
    )
    return float(rows[0]["d"])


# ---------------------------------------------------------------------------
# Cuadrículas, mapa de calor y corredores
# ---------------------------------------------------------------------------
def grid_counts(
    db: Session, bbox: BBox, cell_m: float, metric: str, shape: str, f: AnalyticsFilters
) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        f"""
        SELECT cell_i, cell_j, trips, users, co2_saved_g, ST_AsGeoJSON(geom, 6) AS geometry
        FROM geo.grid_counts(:xmin, :ymin, :xmax, :ymax, :cell, :metric, :shape, {_F}, :k)
    """,  # noqa: S608
        {
            **f.params(),
            **_bbox_params(bbox),
            "cell": cell_m,
            "metric": metric,
            "shape": shape,
            "k": MIN_USERS,
        },
    )
    for r in rows:
        r["geometry"] = _geojson(r["geometry"])
    return rows


def point_density(
    db: Session, bbox: BBox, cell_m: float, point: str, f: AnalyticsFilters
) -> list[dict[str, Any]]:
    return _rows(
        db,
        f"""
        SELECT lon, lat, weight, users
        FROM geo.point_density(:xmin, :ymin, :xmax, :ymax, :cell, :point, {_F}, :k)
    """,  # noqa: S608
        {**f.params(), **_bbox_params(bbox), "cell": cell_m, "point": point, "k": MIN_USERS},
    )


def corridors(
    db: Session, bbox: BBox, cell_m: float, quantile: float, min_cells: int, f: AnalyticsFilters
) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        f"""
        SELECT corridor_id, cells, trips, users, max_cell_trips, span_m, elongation, modes,
               ST_AsGeoJSON(geom, 6) AS geometry
        FROM geo.mobility_corridors(:xmin, :ymin, :xmax, :ymax, :cell, :q, {_F}, :k, :mc)
    """,  # noqa: S608
        {
            **f.params(),
            **_bbox_params(bbox),
            "cell": cell_m,
            "q": quantile,
            "k": MIN_USERS,
            "mc": min_cells,
        },
    )
    for r in rows:
        r["geometry"] = _geojson(r["geometry"])
        r["modes"] = _geojson(r["modes"]) or {}
    return rows


def priority_inputs(
    db: Session, bbox: BBox, cell_m: float, f: AnalyticsFilters
) -> list[dict[str, Any]]:
    """Observaciones crudas por celda; el puntaje lo calcula priority_index.score_cells."""
    rows = _rows(
        db,
        """
        SELECT cell_i, cell_j, zone_name, users, trip_ends, bike_like_ends, walk_ends, bus_ends,
               short_car_ends, bike_like_route_trips, walk_route_trips, bus_route_trips,
               dist_bike_lane_m, dist_bike_station_m, dist_bus_stop_m,
               ST_AsGeoJSON(geom, 6) AS geometry
        FROM geo.priority_inputs(:xmin, :ymin, :xmax, :ymax, :cell,
                                 CAST(:f AS timestamptz), CAST(:t AS timestamptz),
                                 CAST(:demo AS boolean))
    """,
        {**f.params(), **_bbox_params(bbox), "cell": cell_m},
    )
    for r in rows:
        r["geometry"] = _geojson(r["geometry"])
    return rows
