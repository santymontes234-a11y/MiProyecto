"""census and vehicle factors

1. `geo.zone_census` (población del Censo 2020 por zona, módulo geo, DDL de db/geo/004_census.sql).
   Idempotente: en desarrollo ya existía creada a mano. Los datos los carga
   `python -m app.services.geo_analytics.inegi_import`.
2. Factores de `vehicle_types` según la edición vigente del informe de la EPA (2026), año modelo 2024,
   rendimiento real sin BEV/PHEV y 8 887 g CO₂/galón (docs/report/DATASETS.md §5).
   COMPACT, HYBRID y ELECTRIC no tienen cifra por tipo en ese informe: se conservan como estimación
   propia y así lo dice su `source`.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-16 21:00:00+00:00
"""

from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Copia congelada de db/geo/004_census.sql (la imagen Docker solo incluye alembic/).
CENSUS_SQL = Path(__file__).resolve().parents[1] / "sql" / "0008_zone_census.sql"

_EPA = ("U.S. Environmental Protection Agency. (2026). The 2025 EPA automotive trends report "
        "(EPA-420-R-26-001); MY2024, sin BEV/PHEV; 8 887 g CO2/galón (EPA-420-F-23-014)")
_OWN = "Estimación propia del proyecto: la EPA (2026) no publica cifra para este tipo"
_GRID = ("Estimación propia: 0.17 kWh/km × factor de la red eléctrica mexicana; "
         "pendiente de verificar con el factor vigente de CRE/SEMARNAT")

NEW = {
    "SEDAN": (174.0, _EPA), "SUV": (224.0, _EPA), "MINIVAN": (217.0, _EPA), "PICKUP": (272.0, _EPA),
    "COMPACT": (150.0, _OWN), "HYBRID": (110.0, _OWN), "ELECTRIC": (75.0, _GRID),
}
OLD = {"SEDAN": 192.0, "SUV": 250.0, "MINIVAN": 230.0, "PICKUP": 290.0, "COMPACT": 150.0, "HYBRID": 110.0,
       "ELECTRIC": 75.0}


def upgrade() -> None:
    conn = op.get_bind()
    # Sin parámetros: el SQL del módulo geo se ejecuta tal cual (no contiene ':' ni '%').
    conn.connection.driver_connection.execute(CENSUS_SQL.read_text(encoding="utf-8"))
    for code, (grams, source) in NEW.items():
        conn.execute(sa.text("UPDATE vehicle_types SET grams_per_km = :g, source = :s, updated_at = now() "
                             "WHERE code = CAST(:c AS vehicle_type)"), {"g": grams, "s": source, "c": code})


def downgrade() -> None:
    conn = op.get_bind()
    for code, grams in OLD.items():
        conn.execute(sa.text("UPDATE vehicle_types SET grams_per_km = :g WHERE code = CAST(:c AS vehicle_type)"),
                     {"g": grams, "c": code})
    op.execute("DROP TABLE IF EXISTS geo.zone_census")
