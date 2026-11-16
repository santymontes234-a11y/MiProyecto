"""Viajes: registro idempotente, cálculo de distancia en PostGIS y CO₂ en el servidor.

Toda consulta filtra por `user_id = current_user.id` (SECURITY.md §2): un viaje ajeno es 404.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, not_found
from app.models import TransportMode, Trip, TripStatus
from app.schemas.geo import LineStringGeometry
from app.services import co2


def _validation(message: str, field: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", "Datos inválidos", [{"loc": ["body", field], "msg": message,
                                                                  "type": "value_error"}])


def _geojson(route: LineStringGeometry) -> str:
    return json.dumps({"type": "LineString", "coordinates": [list(p) for p in route.coordinates]})


def _geom_expr(route_json: str):  # noqa: ANN202 - expresión SQLAlchemy
    # Parámetro enlazado: el GeoJSON nunca se concatena en el SQL.
    return func.ST_SetSRID(func.ST_GeomFromGeoJSON(route_json), 4326)


def measure_route(db: Session, route: LineStringGeometry) -> float:
    """Distancia geodésica en metros calculada por PostGIS (nunca la del cliente)."""
    geom = _geom_expr(_geojson(route))
    valid, length = db.execute(
        select(func.ST_IsValid(geom), func.ST_Length(func.Geography(geom)))
    ).one()
    if not valid:
        raise _validation("La ruta no es una geometría válida", "route")
    return float(length or 0.0)


def _validate_times(started_at: datetime, ended_at: datetime) -> None:
    s = get_settings()
    now = datetime.now(UTC)
    if ended_at <= started_at:
        raise _validation("ended_at debe ser posterior a started_at", "ended_at")
    if ended_at > now + timedelta(minutes=s.trip_future_tolerance_minutes):
        raise _validation("El viaje no puede terminar en el futuro", "ended_at")
    if ended_at - started_at > timedelta(hours=s.max_trip_duration_hours):
        raise _validation(f"Un viaje no puede durar más de {s.max_trip_duration_hours} horas", "ended_at")


def _with_route() -> Select[Any]:
    return select(Trip, func.ST_AsGeoJSON(Trip.route).label("route_geojson"))


def to_dict(trip: Trip, route_geojson: str | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": trip.id,
        "mode": trip.mode,
        "status": trip.status,
        "started_at": trip.started_at,
        "ended_at": trip.ended_at,
        "distance_m": trip.distance_m,
        "duration_s": trip.duration_s,
        "co2_emitted_g": trip.co2_emitted_g,
        "co2_saved_g": trip.co2_saved_g,
    }
    if route_geojson is not None:
        data.update(
            client_trip_id=trip.client_trip_id,
            emission_factor_g_per_km=trip.emission_factor_g_per_km,
            route=json.loads(route_geojson),
            created_at=trip.created_at,
        )
    return data


def get_owned(db: Session, user_id: uuid.UUID, trip_id: uuid.UUID) -> dict[str, Any]:
    row = db.execute(_with_route().where(Trip.id == trip_id, Trip.user_id == user_id)).first()
    if row is None:
        raise not_found("trip")
    return to_dict(row[0], row[1])


def _find_by_client_id(db: Session, user_id: uuid.UUID, client_trip_id: uuid.UUID) -> dict[str, Any] | None:
    row = db.execute(
        _with_route().where(Trip.user_id == user_id, Trip.client_trip_id == client_trip_id)
    ).first()
    return to_dict(row[0], row[1]) if row else None


def create(
    db: Session,
    user_id: uuid.UUID,
    *,
    client_trip_id: uuid.UUID,
    mode: TransportMode,
    started_at: datetime,
    ended_at: datetime,
    route: LineStringGeometry,
) -> tuple[dict[str, Any], bool]:
    """Devuelve (viaje, creado). Si `client_trip_id` ya existía, devuelve el existente (ADR-004)."""
    existing = _find_by_client_id(db, user_id, client_trip_id)
    if existing is not None:
        return existing, False

    _validate_times(started_at, ended_at)
    distance_m = measure_route(db, route)
    if distance_m <= 0:
        raise _validation("La ruta debe tener longitud mayor que cero", "route")
    result = co2.estimate(db, mode, distance_m)
    trip = Trip(
        id=uuid.uuid4(),
        user_id=user_id,
        client_trip_id=client_trip_id,
        mode=mode,
        status=TripStatus.COMPLETED,
        started_at=started_at,
        ended_at=ended_at,
        distance_m=result.distance_m,
        duration_s=max(1, int((ended_at - started_at).total_seconds())),
        route=_geom_expr(_geojson(route)),
        emission_factor_g_per_km=result.emission_factor_g_per_km,
        co2_emitted_g=result.co2_emitted_g,
        co2_saved_g=result.co2_saved_g,
    )
    db.add(trip)
    try:
        db.commit()
    except IntegrityError:
        # Carrera entre dos reintentos con el mismo client_trip_id.
        db.rollback()
        existing = _find_by_client_id(db, user_id, client_trip_id)
        if existing is None:
            raise
        return existing, False
    return get_owned(db, user_id, trip.id), True


def list_owned(
    db: Session,
    user_id: uuid.UUID,
    *,
    page: int,
    page_size: int,
    mode: TransportMode | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> tuple[list[dict[str, Any]], int]:
    conds = [Trip.user_id == user_id]
    if mode is not None:
        conds.append(Trip.mode == mode)
    if date_from is not None:
        conds.append(Trip.started_at >= date_from)
    if date_to is not None:
        conds.append(Trip.started_at < date_to)
    total = db.execute(select(func.count()).select_from(Trip).where(*conds)).scalar_one()
    rows = db.execute(
        select(Trip)
        .where(*conds)
        .order_by(Trip.started_at.desc(), Trip.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).scalars()
    return [to_dict(t) for t in rows], total


def delete_owned(db: Session, user_id: uuid.UUID, trip_id: uuid.UUID) -> None:
    trip = db.execute(select(Trip).where(Trip.id == trip_id, Trip.user_id == user_id)).scalar_one_or_none()
    if trip is None:
        raise not_found("trip")
    db.delete(trip)
    db.commit()
