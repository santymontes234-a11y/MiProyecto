"""Indicadores agregados de movilidad (ciudad) para el panel ADMIN.

* Fuente: geo.v_trips (viajes COMPLETED) y la vista materializada
  geo.mv_daily_stats para series y horas pico.
* Los valores de CO₂ son sumas de lo guardado por viaje (ADR-002); ver
  emissions.py para el desglose.
* Zona horaria de agrupación: America/Mexico_City.
* k-anonimato: si el rango tiene menos de CITY_MIN_TRIPS viajes se devuelven
  ceros/listas vacías con ``suppressed = true`` (mismo criterio que /stats/city).
"""

from __future__ import annotations

from typing import Any, Literal

from sqlalchemy.orm import Session

from app.services.geo_analytics import emissions
from app.services.geo_analytics.filters import SUSTAINABLE_EXCLUDED, AnalyticsFilters
from app.services.geo_analytics.repository import _F, _rows

TZ = "America/Mexico_City"
CITY_MIN_TRIPS = 10
Granularity = Literal["day", "week", "month"]

_NOT_SUSTAINABLE = "ARRAY[" + ", ".join(f"'{m}'" for m in SUSTAINABLE_EXCLUDED) + "]"


def summary(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    row = _rows(
        db,
        f"""
        SELECT count(*)                                   AS trips_count,
               count(DISTINCT t.user_id)                  AS active_users,
               COALESCE(sum(t.distance_m), 0)             AS distance_m,
               COALESCE(sum(t.distance_m) FILTER (WHERE t.mode_code <> ALL ({_NOT_SUSTAINABLE})), 0)
                                                          AS sustainable_distance_m,
               count(*) FILTER (WHERE t.mode_code <> ALL ({_NOT_SUSTAINABLE})) AS sustainable_trips,
               COALESCE(sum(t.co2_emitted_g), 0)          AS co2_emitted_g,
               COALESCE(sum(t.co2_saved_g), 0)            AS co2_saved_g
        FROM geo.trips_filtered({_F}) t
    """,  # noqa: S608
        f.params(),
    )[0]
    by_mode = modes(db, f)
    suppressed = int(row["trips_count"]) < CITY_MIN_TRIPS
    if suppressed:
        row = {k: 0 for k in row}
        by_mode = []
    return {
        **{k: (round(float(v), 1) if isinstance(v, float) else int(v)) for k, v in row.items()},
        "by_mode": by_mode,
        "co2": emissions.totals(by_mode) if by_mode else None,
        "suppressed": suppressed,
    }


def modes(db: Session, f: AnalyticsFilters) -> list[dict[str, Any]]:
    """Medios más utilizados + CO₂ por transporte (desglose explicable)."""
    rows = _rows(
        db,
        f"""
        SELECT t.mode_code AS mode,
               count(*) AS trips_count,
               count(DISTINCT t.user_id) AS users,
               COALESCE(sum(t.distance_m), 0) AS distance_m,
               COALESCE(sum(t.co2_emitted_g), 0) AS co2_emitted_g,
               COALESCE(sum(t.co2_saved_g), 0) AS co2_saved_g,
               count(*) FILTER (WHERE t.co2_saved_g = 0 AND t.co2_emitted_g > 0
                                  AND t.mode_code <> 'CAR') AS clamped_trips
        FROM geo.trips_filtered({_F}) t
        GROUP BY t.mode_code
        ORDER BY count(*) DESC
    """,  # noqa: S608
        f.params(),
    )
    total = sum(int(r["trips_count"]) for r in rows) or 1
    out = []
    for r in rows:
        b = emissions.breakdown(r)
        b["share_of_trips"] = round(int(r["trips_count"]) / total, 4)
        b["users"] = int(r["users"])
        out.append(b)
    return out


def peak_hours(db: Session, f: AnalyticsFilters, by_weekday: bool) -> dict[str, Any]:
    group = "hour, weekday" if by_weekday else "hour"
    rows = _rows(
        db,
        f"""
        SELECT {group}, sum(trips_count)::bigint AS trips_count,
               COALESCE(sum(co2_saved_g), 0) AS co2_saved_g
        FROM geo.mv_daily_stats
        WHERE is_demo = :demo
          AND day >= (CAST(:f AS timestamptz) AT TIME ZONE '{TZ}')::date
          AND day <  (CAST(:t AS timestamptz) AT TIME ZONE '{TZ}')::date
          AND (CAST(:modes AS text[]) IS NULL OR mode_code = ANY (CAST(:modes AS text[])))
        GROUP BY {group}
        ORDER BY {group}
    """,  # noqa: S608
        f.params(),
    )
    total = sum(int(r["trips_count"]) for r in rows)
    suppressed = total < CITY_MIN_TRIPS
    return {
        "items": [] if suppressed else rows,
        "suppressed": suppressed,
        "source": "geo.mv_daily_stats",
        "timezone": TZ,
        "note": "Agregado precalculado por día local; refleja el último refresco de la vista.",
    }


def timeseries(db: Session, f: AnalyticsFilters, granularity: Granularity) -> dict[str, Any]:
    if granularity not in ("day", "week", "month"):
        raise ValueError("granularity inválida")
    rows = _rows(
        db,
        f"""
        WITH agg AS (
            SELECT date_trunc('{granularity}', day::timestamp) AS p,
                   sum(trips_count)::bigint AS trips_count,
                   COALESCE(sum(distance_m), 0) AS distance_m,
                   COALESCE(sum(co2_saved_g), 0) AS co2_saved_g
            FROM geo.mv_daily_stats
            WHERE is_demo = :demo
              AND day >= (CAST(:f AS timestamptz) AT TIME ZONE '{TZ}')::date
              AND day <  (CAST(:t AS timestamptz) AT TIME ZONE '{TZ}')::date
              AND (CAST(:modes AS text[]) IS NULL OR mode_code = ANY (CAST(:modes AS text[])))
            GROUP BY 1
        ),
        users AS (
            SELECT date_trunc('{granularity}', t.started_at AT TIME ZONE '{TZ}') AS p,
                   count(DISTINCT t.user_id) AS active_users
            FROM geo.trips_filtered({_F}) t
            GROUP BY 1
        )
        SELECT (agg.p AT TIME ZONE '{TZ}') AS period_start,
               agg.trips_count, agg.distance_m, agg.co2_saved_g,
               COALESCE(users.active_users, 0) AS active_users
        FROM agg LEFT JOIN users ON users.p = agg.p
        ORDER BY agg.p
    """,  # noqa: S608
        f.params(),
    )
    suppressed = sum(int(r["trips_count"]) for r in rows) < CITY_MIN_TRIPS
    return {
        "granularity": granularity,
        "timezone": TZ,
        "points": [] if suppressed else rows,
        "suppressed": suppressed,
    }
