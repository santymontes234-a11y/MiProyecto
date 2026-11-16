"""geo analytics schema

Esquema `geo` del módulo geoespacial: tablas DEMO aisladas, zonas de movilidad, vistas
adaptadoras sobre public.trips/cycleways/pois (geo.v_*), funciones de analítica y la vista
materializada geo.mv_daily_stats.

El SQL está congelado en alembic/sql/0003_geo/ (copia de apps/api/db/geo/ del 2026-11-16).
Los cambios posteriores al SQL del módulo geo deben ir en migraciones nuevas, no editando estos
archivos. 900_demo_seed.sql NO se migra: es un seed DEMO opcional para desarrollo.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-16 03:00:00+00:00
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SQL_DIR = Path(__file__).resolve().parents[1] / "sql" / "0003_geo"
FILES = ("001_schema.sql", "002_functions.sql", "003_aggregates.sql")

# Índices de expresión que geo.rebuild_adapters() crea en tablas de public.
PUBLIC_INDEXES = (
    "ix_trips_geo_origin_utm",
    "ix_trips_geo_dest_utm",
    "ix_trips_geo_route_utm",
    "ix_trips_geo_mode_started",
    "ix_cycleways_geo_utm",
    "ix_pois_geo_utm",
)


def upgrade() -> None:
    # Conexión del driver, misma transacción que Alembic. Sin parámetros, psycopg no interpreta
    # los `%` del SQL (p. ej. LIKE 'DEMO %') y acepta varias sentencias y bloques $$.
    driver = op.get_bind().connection.driver_connection
    for name in FILES:
        driver.execute((SQL_DIR / name).read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS geo CASCADE")
    for index in PUBLIC_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS public.{index}")
