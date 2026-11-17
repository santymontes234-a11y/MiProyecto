"""Viajes: registro idempotente, validaciones de negocio (§4.1), distancia en PostGIS, CO₂ y puntos
en el servidor (ADR-002), edición, viajes recurrentes y estimaciones.

Toda consulta filtra por `user_id = current_user.id` (SECURITY.md §2): un viaje ajeno es 404.
"""

import json
import uuid
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import route_token
from app.core.config import get_settings
from app.core.errors import AppError, not_found
from app.models import TransportMode, TransportModeInfo, Trip, TripSource, TripStatus, VehicleType
from app.schemas.geo import LineStringGeometry
from app.schemas.trip import RecurringTripCreate, TripCreate, TripUpdate
from app.services import co2, gamification

Coords = list[list[float]]


def _validation(message: str, field: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", "Datos inválidos", [{"loc": ["body", field], "msg": message,
                                                                  "type": "value_error"}])


def _coords(route: LineStringGeometry) -> Coords:
    return [[float(p[0]), float(p[1])] for p in route.coordinates]


def _geojson(coords: Coords) -> str:
    return json.dumps({"type": "LineString", "coordinates": coords})


def _geom_expr(route_json: str):  # noqa: ANN202 - expresión SQLAlchemy
    # Parámetro enlazado: el GeoJSON nunca se concatena en el SQL.
    return func.ST_SetSRID(func.ST_GeomFromGeoJSON(route_json), 4326)


# --- Validaciones §4.1 ----------------------------------------------------------------------------


def check_service_area(coords: Coords) -> None:
    min_lng, min_lat, max_lng, max_lat = get_settings().service_area
    if any(not (min_lng <= x <= max_lng and min_lat <= y <= max_lat) for x, y in coords):
        raise AppError(422, "TRIP_OUTSIDE_SERVICE_AREA", "La ruta sale del área de servicio (estado de Querétaro)")


def measure_coords(db: Session, coords: Coords) -> float:
    """Distancia geodésica en metros calculada por PostGIS (nunca la del cliente)."""
    geom = _geom_expr(_geojson(coords))
    valid, length = db.execute(select(func.ST_IsValid(geom), func.ST_Length(func.Geography(geom)))).one()
    if not valid:
        raise _validation("La ruta no es una geometría válida", "route")
    return float(length or 0.0)


def measure_route(db: Session, route: LineStringGeometry) -> float:
    return measure_coords(db, _coords(route))


def check_min_distance(distance_m: float) -> None:
    minimum = get_settings().min_trip_distance_m
    if distance_m < minimum:
        raise AppError(422, "TRIP_TOO_SHORT", f"El viaje debe medir al menos {int(minimum)} m")


def mode_info(db: Session, mode: TransportMode) -> TransportModeInfo:
    info = db.get(TransportModeInfo, mode)
    if info is None or not info.is_active:
        raise AppError(422, "MODE_INACTIVE", "El medio de transporte no está disponible", {"mode": mode.value})
    return info


def check_speed(info: TransportModeInfo, distance_m: float, duration_s: float) -> None:
    kmh = (distance_m / 1000.0) / (max(duration_s, 1) / 3600.0)
    if kmh > info.max_speed_kmh:
        raise AppError(422, "TRIP_IMPLAUSIBLE_SPEED",
                       f"Velocidad media de {kmh:.0f} km/h no plausible para este medio",
                       {"mode": info.mode.value, "speed_kmh": round(kmh, 1), "max_speed_kmh": info.max_speed_kmh})


def _validate_times(started_at: datetime, ended_at: datetime) -> None:
    s = get_settings()
    now = datetime.now(UTC)
    if ended_at <= started_at:
        raise _validation("ended_at debe ser posterior a started_at", "ended_at")
    if ended_at > now + timedelta(minutes=s.trip_future_tolerance_minutes):
        raise _validation("El viaje no puede terminar en el futuro", "ended_at")
    if ended_at - started_at > timedelta(hours=s.max_trip_duration_hours):
        raise _validation(f"Un viaje no puede durar más de {s.max_trip_duration_hours} horas", "ended_at")


def _overlap(db: Session, user_id: uuid.UUID, mode: TransportMode, started_at: datetime, ended_at: datetime,
             exclude: uuid.UUID | None = None) -> uuid.UUID | None:
    q = select(Trip.id).where(
        Trip.user_id == user_id, Trip.mode == mode, Trip.status == TripStatus.COMPLETED,
        Trip.started_at < ended_at, Trip.ended_at > started_at,
    )
    if exclude is not None:
        q = q.where(Trip.id != exclude)
    return db.execute(q.limit(1)).scalar_one_or_none()


def check_duplicate(db: Session, user_id: uuid.UUID, mode: TransportMode, started_at: datetime,
                    ended_at: datetime, exclude: uuid.UUID | None = None) -> None:
    other = _overlap(db, user_id, mode, started_at, ended_at, exclude)
    if other is not None:
        raise AppError(409, "TRIP_DUPLICATE", "Ya registraste un viaje en ese horario con el mismo medio",
                       {"trip_id": str(other)})


def check_source(source: TripSource, token: str | None, coords: Coords, mode: TransportMode) -> None:
    if source == TripSource.GPS:
        if token is not None:
            raise _validation("route_token solo se envía con source = PLANNED", "route_token")
        return
    if not token:
        raise AppError(422, "ROUTE_TOKEN_INVALID", "Falta el route_token de la ruta planificada")
    if not route_token.verify(token, coords, mode.value):
        raise AppError(422, "ROUTE_TOKEN_INVALID", "El route_token no es válido para esta ruta y medio")


# --- Lectura --------------------------------------------------------------------------------------


def _with_route() -> Select[Any]:
    return select(Trip, func.ST_AsGeoJSON(Trip.route).label("route_geojson"))


def to_dict(trip: Trip, route_geojson: str | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": trip.id, "mode": trip.mode, "status": trip.status,
        "started_at": trip.started_at, "ended_at": trip.ended_at,
        "distance_m": trip.distance_m, "duration_s": trip.duration_s,
        "co2_emitted_g": trip.co2_emitted_g, "co2_saved_g": trip.co2_saved_g,
        "source": trip.source, "recurrence_id": trip.recurrence_id, "points": trip.points,
        "vehicle_type": trip.vehicle_type, "occupants": trip.occupants, "user_id": trip.user_id,
    }
    if route_geojson is not None:
        data.update(
            client_trip_id=trip.client_trip_id,
            emission_factor_g_per_km=trip.emission_factor_g_per_km,
            route=json.loads(route_geojson),
            created_at=trip.created_at,
            updated_at=trip.updated_at,
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


# --- Estimaciones ---------------------------------------------------------------------------------


def _distance_for_estimate(db: Session, route: LineStringGeometry | None, distance_m: float | None) -> float:
    if route is not None:
        coords = _coords(route)
        check_service_area(coords)
        distance = measure_coords(db, coords)
    else:
        distance = float(distance_m or 0)
    check_min_distance(distance)
    return distance


def estimate(db: Session, user_id: uuid.UUID, mode: TransportMode, route: LineStringGeometry | None,
             distance_m: float | None, vehicle_type: VehicleType | None, occupants: int | None) -> dict[str, Any]:
    distance = _distance_for_estimate(db, route, distance_m)
    mode_info(db, mode)
    r = co2.estimate(db, mode, distance, user_id=user_id, vehicle_type=vehicle_type, occupants=occupants)
    return co2.to_estimate_dict(r)


def estimate_batch(db: Session, user_id: uuid.UUID, modes: list[TransportMode], route: LineStringGeometry | None,
                   distance_m: float | None, vehicle_type: VehicleType | None,
                   occupants: int | None) -> dict[str, Any]:
    distance = _distance_for_estimate(db, route, distance_m)
    items = []
    for mode in modes:
        mode_info(db, mode)
        is_car = mode in co2.CAR_MODES
        # vehicle_type/occupants se aplican solo a CAR/CARPOOL; el resto los ignora en el lote.
        occ = occupants if is_car else None
        if mode == TransportMode.CARPOOL and occ is not None and occ < 2:
            occ = 2
        r = co2.estimate(db, mode, distance, user_id=user_id,
                         vehicle_type=vehicle_type if is_car else None, occupants=occ)
        items.append(co2.to_estimate_dict(r))
    return {"items": items}


# --- Alta, edición y borrado ----------------------------------------------------------------------


def create(db: Session, user_id: uuid.UUID, data: TripCreate) -> tuple[dict[str, Any], bool]:
    """Devuelve (viaje, creado). Si `client_trip_id` ya existía, devuelve el existente (ADR-004)."""
    existing = _find_by_client_id(db, user_id, data.client_trip_id)
    if existing is not None:
        return existing, False

    coords = _coords(data.route)
    _validate_times(data.started_at, data.ended_at)
    co2.check_vehicle_fields(data.mode, data.vehicle_type, data.occupants)
    check_source(data.source, data.route_token, coords, data.mode)
    check_service_area(coords)
    distance_m = measure_coords(db, coords)
    check_min_distance(distance_m)
    info = mode_info(db, data.mode)
    duration_s = max(1, int((data.ended_at - data.started_at).total_seconds()))
    check_speed(info, distance_m, duration_s)
    check_duplicate(db, user_id, data.mode, data.started_at, data.ended_at)
    result = co2.estimate(db, data.mode, distance_m, user_id=user_id, vehicle_type=data.vehicle_type,
                          occupants=data.occupants)
    trip = Trip(
        id=uuid.uuid4(), user_id=user_id, client_trip_id=data.client_trip_id, mode=data.mode,
        status=TripStatus.COMPLETED, started_at=data.started_at, ended_at=data.ended_at,
        distance_m=result.distance_m, duration_s=duration_s, route=_geom_expr(_geojson(coords)),
        emission_factor_g_per_km=result.emission_factor_g_per_km, co2_emitted_g=result.co2_emitted_g,
        co2_saved_g=result.co2_saved_g, source=data.source, points=result.points,
        vehicle_type=result.vehicle_type, occupants=result.occupants,
    )
    db.add(trip)
    try:
        db.flush()
        gamification.evaluate(db, user_id)
        db.commit()
    except IntegrityError:
        # Carrera entre dos reintentos con el mismo client_trip_id.
        db.rollback()
        existing = _find_by_client_id(db, user_id, data.client_trip_id)
        if existing is None:
            raise
        return existing, False
    return get_owned(db, user_id, trip.id), True


def update(db: Session, user_id: uuid.UUID, trip_id: uuid.UUID, data: TripUpdate) -> dict[str, Any]:
    row = db.execute(
        _with_route().where(Trip.id == trip_id, Trip.user_id == user_id).with_for_update(of=Trip)
    ).first()
    if row is None:
        raise not_found("trip")
    trip, route_json = row[0], row[1]
    changes = data.model_dump(exclude_unset=True)
    for field in ("mode", "status", "started_at", "ended_at", "route", "source"):
        if field in changes and changes[field] is None:
            raise _validation("No puede ser null", field)

    mode = data.mode or trip.mode
    status = data.status or trip.status
    started_at = data.started_at or trip.started_at
    ended_at = data.ended_at or trip.ended_at
    source = data.source or trip.source
    coords = _coords(data.route) if data.route is not None else json.loads(route_json)["coordinates"]
    mode_changed = mode != trip.mode

    if mode in co2.CAR_MODES:
        vehicle_type = changes["vehicle_type"] if "vehicle_type" in changes else (None if mode_changed else trip.vehicle_type)
        occupants = changes["occupants"] if "occupants" in changes else (None if mode_changed else trip.occupants)
    else:
        vehicle_type, occupants = data.vehicle_type, data.occupants  # check_vehicle_fields rechaza valores
    co2.check_vehicle_fields(mode, vehicle_type, occupants)

    if "started_at" in changes or "ended_at" in changes:
        _validate_times(started_at, ended_at)
    # El token es obligatorio si el viaje queda PLANNED y cambia la geometría, el medio o el origen.
    if source == TripSource.PLANNED and (data.route is not None or mode_changed or "source" in changes
                                         or data.route_token is not None):
        check_source(source, data.route_token, coords, mode)
    elif source == TripSource.GPS:
        check_source(source, data.route_token, coords, mode)

    distance_m = trip.distance_m
    if data.route is not None:
        check_service_area(coords)
        distance_m = measure_coords(db, coords)
        check_min_distance(distance_m)
    duration_s = max(1, int((ended_at - started_at).total_seconds()))
    info = mode_info(db, mode) if (mode_changed or status == TripStatus.COMPLETED) else None
    if info is not None:
        check_speed(info, distance_m, duration_s)
    if status == TripStatus.COMPLETED:
        check_duplicate(db, user_id, mode, started_at, ended_at, exclude=trip.id)

    result = co2.estimate(db, mode, distance_m, user_id=user_id, vehicle_type=vehicle_type, occupants=occupants)
    trip.mode, trip.status, trip.source = mode, status, source
    trip.started_at, trip.ended_at, trip.duration_s = started_at, ended_at, duration_s
    if data.route is not None:
        trip.route = _geom_expr(_geojson(coords))
    trip.distance_m = result.distance_m
    trip.emission_factor_g_per_km = result.emission_factor_g_per_km
    trip.co2_emitted_g, trip.co2_saved_g = result.co2_emitted_g, result.co2_saved_g
    trip.vehicle_type, trip.occupants = result.vehicle_type, result.occupants
    trip.points = result.points if status == TripStatus.COMPLETED else 0
    trip.updated_at = datetime.now(UTC)
    db.flush()
    gamification.evaluate(db, user_id)
    db.commit()
    return get_owned(db, user_id, trip.id)


def create_recurring(db: Session, user_id: uuid.UUID, data: RecurringTripCreate) -> dict[str, Any]:
    tz = timezone(timedelta(minutes=data.utc_offset_minutes))
    today_local = datetime.now(tz).date()
    if data.end_date > today_local:
        raise _validation("end_date no puede ser posterior a hoy", "end_date")
    coords = _coords(data.route)
    co2.check_vehicle_fields(data.mode, data.vehicle_type, data.occupants)
    check_service_area(coords)
    distance_m = measure_coords(db, coords)
    check_min_distance(distance_m)
    info = mode_info(db, data.mode)
    check_speed(info, distance_m, data.duration_s)
    result = co2.estimate(db, data.mode, distance_m, user_id=user_id, vehicle_type=data.vehicle_type,
                          occupants=data.occupants)

    hh, mm = (int(x) for x in data.departure_time.split(":"))
    recurrence_id = uuid.uuid4()
    now = datetime.now(UTC)
    route_json = _geojson(coords)
    created: list[uuid.UUID] = []
    skipped = 0
    day: date = data.start_date
    while day <= data.end_date:
        if day.weekday() in data.weekdays:
            started = datetime.combine(day, time(hh, mm), tzinfo=tz).astimezone(UTC)
            ended = started + timedelta(seconds=data.duration_s)
            if ended <= now and _overlap(db, user_id, data.mode, started, ended) is None:
                trip = Trip(
                    id=uuid.uuid4(), user_id=user_id,
                    client_trip_id=uuid.uuid5(recurrence_id, day.isoformat()),
                    mode=data.mode, status=TripStatus.COMPLETED, started_at=started, ended_at=ended,
                    distance_m=result.distance_m, duration_s=data.duration_s, route=_geom_expr(route_json),
                    emission_factor_g_per_km=result.emission_factor_g_per_km,
                    co2_emitted_g=result.co2_emitted_g, co2_saved_g=result.co2_saved_g,
                    source=TripSource.GPS, points=result.points, recurrence_id=recurrence_id,
                    vehicle_type=result.vehicle_type, occupants=result.occupants,
                )
                db.add(trip)
                db.flush()
                created.append(trip.id)
            else:
                skipped += 1
        day += timedelta(days=1)
    gamification.evaluate(db, user_id)
    db.commit()
    return {"recurrence_id": recurrence_id, "created": len(created), "skipped_duplicates": skipped,
            "trip_ids": created}


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
        select(Trip).where(*conds).order_by(Trip.started_at.desc(), Trip.id.desc())
        .limit(page_size).offset((page - 1) * page_size)
    ).scalars()
    return [to_dict(t) for t in rows], total


def delete_owned(db: Session, user_id: uuid.UUID, trip_id: uuid.UUID) -> None:
    trip = db.execute(select(Trip).where(Trip.id == trip_id, Trip.user_id == user_id)).scalar_one_or_none()
    if trip is None:
        raise not_found("trip")
    db.delete(trip)
    db.commit()
