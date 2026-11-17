"""Especialización de POIs (transit_stops / bike_stations) ↔ `attributes` del contrato (§5.1).

La API sigue exponiendo `attributes.code`, `attributes.lines`, `attributes.ref` y `attributes.capacity`
(contrato sin cambios), pero esos datos viven en tablas normalizadas. Este módulo:
- `split`: separa del JSON recibido las claves estructuradas y las valida.
- `sync`: escribe el subtipo que corresponde a la categoría (disyunción) y borra el que no.
- `compose`: reconstruye `attributes` para las respuestas.
Lo usan el CRUD admin de POIs y el importador OSM del módulo geo.
"""

import re
import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import BikeStation, PoiCategory, StopLine, TransitLine, TransitStop

STOP_CATEGORIES = {PoiCategory.BUS_STOP}
BIKE_CATEGORIES = {PoiCategory.BIKE_SHARING, PoiCategory.BIKE_PARKING}
_CODE_RE = re.compile(r"^[A-Z0-9_-]{2,32}$")
_LINE_RE = re.compile(r"^[A-Za-z0-9 ._-]{1,32}$")
STRUCTURED_KEYS = ("code", "lines", "ref", "capacity")


@dataclass
class Specialization:
    code: str | None = None
    lines: list[str] = field(default_factory=list)
    osm_ref: str | None = None
    capacity: int | None = None


def _invalid(field_name: str, msg: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", "Datos inválidos",
                    [{"loc": ["body", "attributes", field_name], "msg": msg, "type": "value_error"}])


def split(category: PoiCategory, attributes: dict[str, Any]) -> tuple[dict[str, Any], Specialization]:
    """Devuelve (attributes libres, datos estructurados). Solo se extraen las claves del subtipo."""
    free = dict(attributes)
    spec = Specialization()
    if category not in STOP_CATEGORIES | BIKE_CATEGORIES:
        return free, spec
    code = free.pop("code", None)
    if code is not None:
        if not isinstance(code, str) or not _CODE_RE.match(code):
            raise _invalid("code", "code debe cumplir ^[A-Z0-9_-]{2,32}$")
        spec.code = code
    if category in STOP_CATEGORIES:
        lines = free.pop("lines", None)
        if lines is not None:
            if (not isinstance(lines, list) or len(lines) > 50
                    or not all(isinstance(x, str) and _LINE_RE.match(x) for x in lines)):
                raise _invalid("lines", "lines debe ser una lista de ≤ 50 textos de ≤ 32 caracteres")
            spec.lines = sorted(set(lines))
        ref = free.pop("ref", None)
        if ref is not None:
            spec.osm_ref = str(ref)[:64]
    else:
        capacity = free.pop("capacity", None)
        if capacity is not None:
            if isinstance(capacity, bool) or not isinstance(capacity, int) or not 1 <= capacity <= 10000:
                raise _invalid("capacity", "capacity debe ser un entero entre 1 y 10000")
            spec.capacity = capacity
    return free, spec


def _code_taken(db: Session, code: str, poi_id: uuid.UUID) -> bool:
    """`code` es único entre paradas y estaciones (contrato §5.1): se comprueba en ambos subtipos."""
    for model in (TransitStop, BikeStation):
        row = db.execute(select(model.poi_id).where(model.code == code, model.poi_id != poi_id)).first()
        if row is not None:
            return True
    return False


def sync(db: Session, poi_id: uuid.UUID, category: PoiCategory, spec: Specialization) -> None:
    """Escribe el subtipo de la categoría y elimina el otro (especialización disjunta)."""
    if spec.code is not None and _code_taken(db, spec.code, poi_id):
        raise AppError(409, "CONFLICT", "Ya existe una parada o estación con ese código")
    if category not in STOP_CATEGORIES:
        db.execute(delete(TransitStop).where(TransitStop.poi_id == poi_id))
    if category not in BIKE_CATEGORIES:
        db.execute(delete(BikeStation).where(BikeStation.poi_id == poi_id))
    db.flush()

    if category in STOP_CATEGORIES:
        stop = db.get(TransitStop, poi_id) or TransitStop(poi_id=poi_id, category=category)
        stop.code, stop.osm_ref = spec.code, spec.osm_ref
        db.add(stop)
        db.flush()
        db.execute(delete(StopLine).where(StopLine.stop_id == poi_id))
        for line_code in spec.lines:
            line = db.execute(select(TransitLine).where(TransitLine.code == line_code)).scalar_one_or_none()
            if line is None:
                line = TransitLine(code=line_code, name=line_code)
                db.add(line)
                db.flush()
            db.add(StopLine(stop_id=poi_id, line_id=line.id))
    elif category in BIKE_CATEGORIES:
        station = db.get(BikeStation, poi_id) or BikeStation(poi_id=poi_id, category=category)
        station.category, station.code, station.capacity = category, spec.code, spec.capacity
        db.add(station)
    db.flush()


def current(db: Session, poi_id: uuid.UUID) -> Specialization:
    return load(db, [poi_id]).get(poi_id, Specialization())


def load(db: Session, poi_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, Specialization]:
    ids = list(poi_ids)
    out: dict[uuid.UUID, Specialization] = {}
    if not ids:
        return out
    for stop in db.execute(select(TransitStop).where(TransitStop.poi_id.in_(ids))).scalars():
        out[stop.poi_id] = Specialization(code=stop.code, osm_ref=stop.osm_ref)
    for stop_id, line_code in db.execute(
        select(StopLine.stop_id, TransitLine.code)
        .join(TransitLine, TransitLine.id == StopLine.line_id)
        .where(StopLine.stop_id.in_(ids))
        .order_by(TransitLine.code)
    ).all():
        out.setdefault(stop_id, Specialization()).lines.append(line_code)
    for st in db.execute(select(BikeStation).where(BikeStation.poi_id.in_(ids))).scalars():
        out[st.poi_id] = Specialization(code=st.code, capacity=st.capacity)
    return out


def compose(attributes: dict[str, Any] | None, spec: Specialization | None) -> dict[str, Any]:
    data = dict(attributes or {})
    if spec is None:
        return data
    if spec.code is not None:
        data["code"] = spec.code
    if spec.lines:
        data["lines"] = list(spec.lines)
    if spec.osm_ref is not None:
        data["ref"] = spec.osm_ref
    if spec.capacity is not None:
        data["capacity"] = spec.capacity
    return data
