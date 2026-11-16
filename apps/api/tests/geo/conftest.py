"""Fixtures del módulo geo.

Se apoyan en tests/conftest.py (BD `ecomove_test` migrada con Alembic) y le
aplican el SQL de apps/api/db/geo/ una vez por sesión, igual que hará la
migración que integre Backend. 900_demo_seed.sql se aplica solo aquí (tests).
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text

GEO_SQL = Path(__file__).resolve().parents[2] / "db" / "geo"
SQL_FILES = ["001_schema.sql", "002_functions.sql", "003_aggregates.sql", "900_demo_seed.sql"]


@pytest.fixture(scope="session")
def geo_schema(_database: None) -> Iterator[None]:
    from app.db.session import engine

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        for name in SQL_FILES:
            cur.execute((GEO_SQL / name).read_text(encoding="utf-8"))
        cur.execute("SELECT geo.seed_demo(3000)")
        cur.execute("SELECT geo.refresh_aggregates()")
        raw.commit()
    finally:
        raw.close()
    yield


@pytest.fixture
def geo_db(geo_schema: None, db: Any) -> Any:
    return db


def insert_official_trips(db: Any, n_users: int = 12, per_user: int = 3) -> list[str]:
    """Viajes 'oficiales' de prueba en public.trips (copian geometrías DEMO)."""
    user_ids = []
    for i in range(n_users):
        uid = db.execute(
            text(
                "INSERT INTO users (id, email, password_hash, full_name) "
                "VALUES (gen_random_uuid(), :e, 'x', 'Prueba Geo') RETURNING id"
            ),
            {"e": f"geo-{i}@example.com"},
        ).scalar_one()
        user_ids.append(str(uid))
    db.execute(
        text("""
        INSERT INTO trips (id, user_id, client_trip_id, mode, status, started_at, ended_at,
                           distance_m, duration_s, route, emission_factor_g_per_km,
                           co2_emitted_g, co2_saved_g)
        SELECT gen_random_uuid(), u.uid, gen_random_uuid(), d.mode_code::transport_mode,
               'COMPLETED', d.started_at, d.ended_at, d.distance_m, 600, d.route,
               d.emission_factor_g_per_km, d.co2_emitted_g, d.co2_saved_g
        FROM unnest(CAST(:uids AS uuid[])) WITH ORDINALITY AS u(uid, k)
        CROSS JOIN LATERAL (
            SELECT * FROM geo.demo_trips WHERE mode_code IN ('BICYCLE', 'BUS', 'WALK', 'CAR')
            ORDER BY id OFFSET (u.k - 1) * :per LIMIT :per
        ) d
        """),
        {"uids": user_ids, "per": per_user},
    )
    db.commit()
    return user_ids
