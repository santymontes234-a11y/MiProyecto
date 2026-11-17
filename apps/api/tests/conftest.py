"""Tests de integración contra PostgreSQL + PostGIS reales (sin mocks de base de datos).

Requiere un servidor PostGIS. Por defecto usa el contenedor de desarrollo; se puede cambiar con
TEST_DATABASE_ADMIN_URL (conexión con permiso para crear bases de datos). Cada ejecución crea su propia base `ecomove_test_<pid>`,
la migra con Alembic (lo que también valida las migraciones) y la borra al terminar.
"""

import os
import secrets
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ADMIN_URL = os.environ.get(
    "TEST_DATABASE_ADMIN_URL", "postgresql+psycopg://ecomove:ecomove_test@127.0.0.1:54329/postgres"
)
# Una base por ejecución: varias sesiones pueden correr la suite a la vez sobre el mismo servidor.
TEST_DB = os.environ.get("TEST_DATABASE_NAME") or f"ecomove_test_{os.getpid()}"
TEST_URL = make_url(ADMIN_URL).set(database=TEST_DB).render_as_string(hide_password=False)

os.environ["DATABASE_URL_OVERRIDE"] = TEST_URL
os.environ.setdefault("JWT_SECRET_KEY", secrets.token_urlsafe(48))
os.environ["API_ENV"] = "test"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
os.environ["BOOTSTRAP_SUPER_ADMIN_EMAIL"] = ""

API_DIR = Path(__file__).resolve().parents[1]
PREFIX = "/api/v1"
PASSWORD = "Segura-2026-pass"

# Factores semilla (DATABASE.md §4), para restaurarlos entre tests.
SEED_SPEEDS = {"WALK": 15, "BICYCLE": 50, "E_SCOOTER": 40, "BUS": 100, "CARPOOL": 160, "MOTORCYCLE": 180, "CAR": 180}
SEED_ACHIEVEMENTS = ["FIRST_TRIP", "TRIPS_10", "TRIPS_50", "DISTANCE_100KM", "CO2_10KG", "CO2_100KG", "MULTIMODAL_3"]
SEED_FACTORS = {"WALK": 0, "BICYCLE": 0, "E_SCOOTER": 25, "BUS": 68, "CARPOOL": 64, "MOTORCYCLE": 103, "CAR": 192}


def _recreate_database() -> None:
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{TEST_DB}" TEMPLATE template0'))
    admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def _database() -> Iterator[None]:
    from alembic import command
    from alembic.config import Config

    _recreate_database()
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    command.upgrade(cfg, "head")
    yield
    from app.db.session import engine

    engine.dispose()
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture(autouse=True)
def _clean(_database: None) -> Iterator[None]:
    from app.core.rate_limit import limiter
    from app.db.session import engine

    limiter.reset()
    yield
    with engine.begin() as conn:
        conn.execute(text(
            "TRUNCATE trips, refresh_tokens, audit_logs, citizen_reports, notifications, user_achievements, "
            "user_tokens, reports, stop_lines, transit_stops, bike_stations, transit_lines, pois, cycleways"
        ))
        conn.execute(text("DELETE FROM geo.mobility_zones WHERE source <> 'DEMO'"))
        conn.execute(text("DELETE FROM achievements WHERE code <> ALL(:seed)"), {"seed": SEED_ACHIEVEMENTS})
        conn.execute(text("UPDATE achievements SET is_active = true"))
        conn.execute(text("UPDATE vehicle_types SET is_active = true"))
        for mode, speed in SEED_SPEEDS.items():
            conn.execute(
                text("UPDATE transport_modes SET max_speed_kmh = :s, is_active = true WHERE mode = CAST(:m AS transport_mode)"),
                {"s": speed, "m": mode},
            )
        # DELETE (no TRUNCATE CASCADE): emission_factors.updated_by → SET NULL conserva los factores.
        conn.execute(text("DELETE FROM users"))
        for mode, grams in SEED_FACTORS.items():
            conn.execute(
                text("UPDATE emission_factors SET grams_per_km = :g, updated_by = NULL WHERE mode = CAST(:m AS transport_mode)"),
                {"g": grams, "m": mode},
            )
    limiter.reset()


@pytest.fixture
def client() -> Iterator[Any]:
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def db() -> Iterator[Any]:
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        yield session


# --- Helpers ------------------------------------------------------------------------------------


def register(client: Any, email: str | None = None, password: str = PASSWORD, name: str = "Ana López") -> dict[str, Any]:
    email = email or f"user-{uuid.uuid4().hex[:10]}@example.com"
    r = client.post(f"{PREFIX}/auth/register", json={"email": email, "password": password, "full_name": name})
    assert r.status_code == 201, r.text
    return r.json()


def auth_header(tokens: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def set_role(user_id: str, role: str) -> None:
    from app.db.session import engine

    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET role = CAST(:r AS user_role) WHERE id = :id"), {"r": role, "id": user_id})


def make_user(client: Any, role: str = "USER", email: str | None = None) -> dict[str, Any]:
    """Registra un usuario, le asigna el rol en la BD y vuelve a iniciar sesión."""
    tokens = register(client, email=email)
    if role != "USER":
        set_role(tokens["user"]["id"], role)
        r = client.post(f"{PREFIX}/auth/login", json={"email": tokens["user"]["email"], "password": PASSWORD})
        assert r.status_code == 200, r.text
        tokens = r.json()
    return tokens


# Ruta de ~1.2 km por Av. Constituyentes (Querétaro), orden [lng, lat].
ROUTE = {
    "type": "LineString",
    "coordinates": [[-100.3930, 20.5880], [-100.3880, 20.5885], [-100.3820, 20.5890]],
}


_TRIP_SLOT = iter(range(1_000_000))


def trip_payload(**overrides: Any) -> dict[str, Any]:
    # Cada viaje en una franja distinta de 30 min: el contrato 1.1 rechaza solapes (TRIP_DUPLICATE).
    end = datetime.now(UTC).replace(microsecond=0) - timedelta(hours=1, minutes=30 * next(_TRIP_SLOT))
    data = {
        "client_trip_id": str(uuid.uuid4()),
        "mode": "BICYCLE",
        "started_at": (end - timedelta(minutes=20)).isoformat(),
        "ended_at": end.isoformat(),
        "route": ROUTE,
    }
    data.update(overrides)
    return data
