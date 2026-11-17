"""Agregados de estadísticas. Solo viajes COMPLETED cuentan."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models import Granularity, Trip, TripStatus

CITY_MIN_TRIPS = 10
TZ = "America/Mexico_City"  # k-anonimato básico del contrato §6


def _conds(user_id: uuid.UUID | None, date_from: datetime | None, date_to: datetime | None) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = [Trip.status == TripStatus.COMPLETED]
    if user_id is not None:
        conds.append(Trip.user_id == user_id)
    if date_from is not None:
        conds.append(Trip.started_at >= date_from)
    if date_to is not None:
        conds.append(Trip.started_at < date_to)
    return conds


def by_mode(db: Session, conds: list[ColumnElement[bool]]) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            Trip.mode,
            func.count(),
            func.coalesce(func.sum(Trip.distance_m), 0.0),
            func.coalesce(func.sum(Trip.co2_saved_g), 0.0),
        )
        .where(*conds)
        .group_by(Trip.mode)
        .order_by(Trip.mode)
    ).all()
    return [
        {"mode": m, "trips_count": c, "distance_m": round(float(d), 1), "co2_saved_g": round(float(s), 2)}
        for m, c, d, s in rows
    ]


def summary(
    db: Session, user_id: uuid.UUID | None, date_from: datetime | None, date_to: datetime | None
) -> dict[str, Any]:
    conds = _conds(user_id, date_from, date_to)
    count, dist, dur, emitted, saved = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(Trip.distance_m), 0.0),
            func.coalesce(func.sum(Trip.duration_s), 0),
            func.coalesce(func.sum(Trip.co2_emitted_g), 0.0),
            func.coalesce(func.sum(Trip.co2_saved_g), 0.0),
        ).where(*conds)
    ).one()
    return {
        "from": date_from,
        "to": date_to,
        "trips_count": count,
        "distance_m": round(float(dist), 1),
        "duration_s": int(dur),
        "co2_emitted_g": round(float(emitted), 2),
        "co2_saved_g": round(float(saved), 2),
        "by_mode": by_mode(db, conds),
    }


def city_summary(db: Session, date_from: datetime | None, date_to: datetime | None) -> dict[str, Any]:
    data = summary(db, None, date_from, date_to)
    if data["trips_count"] < CITY_MIN_TRIPS:
        return {**data, "trips_count": 0, "distance_m": 0.0, "duration_s": 0, "co2_emitted_g": 0.0,
                "co2_saved_g": 0.0, "by_mode": []}
    # Tampoco se publican modos con pocos viajes (podrían identificar a una persona).
    data["by_mode"] = [m for m in data["by_mode"] if m["trips_count"] >= CITY_MIN_TRIPS]
    return data


def timeseries(
    db: Session, user_id: uuid.UUID, granularity: Granularity, date_from: datetime, date_to: datetime
) -> dict[str, Any]:
    # Periodos cortados en America/Mexico_City (contrato §0) y devueltos como instantes UTC.
    local = func.date_trunc(granularity.value, func.timezone(TZ, Trip.started_at))
    period = func.timezone(TZ, local).label("period")
    rows = db.execute(
        select(
            period,
            func.count(),
            func.coalesce(func.sum(Trip.distance_m), 0.0),
            func.coalesce(func.sum(Trip.co2_saved_g), 0.0),
        )
        .where(*_conds(user_id, date_from, date_to))
        .group_by(period)
        .order_by(period)
    ).all()
    return {
        "granularity": granularity,
        "points": [
            {"period_start": p, "trips_count": c, "distance_m": round(float(d), 1), "co2_saved_g": round(float(s), 2)}
            for p, c, d, s in rows
        ],
    }
