"""vehicle types

Contrato 1.2.0 §4.3 (observaciones O4/O5 del usuario):

- Enum `vehicle_type` y tabla `vehicle_types` (code PK, factor g CO₂/km por vehículo, ocupantes máximos,
  activo y fuente APA). Valores provisionales; los definitivos (EPA, 2026) los pone la 0008 y están
  documentados en docs/report/NORMALIZACION.md §6 y DATASETS.md §5.
- `trips.vehicle_type` (FK) y `trips.occupants` (1..8) con CHECK: solo CAR/CARPOOL y CARPOOL ≥ 2.
- `user_preferences.default_vehicle_type` (FK).

Los viajes existentes no cambian (conservan su factor histórico, ARCHITECTURE §6).

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-16 20:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VEHICLE_TYPE = postgresql.ENUM(
    "COMPACT", "SEDAN", "SUV", "PICKUP", "MINIVAN", "HYBRID", "ELECTRIC", name="vehicle_type", create_type=False
)

# Valores provisionales: la migración 0008 los sustituye por los de U.S. EPA (2026), The 2025 EPA
# automotive trends report (EPA-420-R-26-001), y corrige la columna `source` (DATASETS.md §5).
_EPA = "Valor provisional; sustituido en la migración 0008 (EPA, 2026, EPA-420-R-26-001)"
_CRE = "Valor provisional; sustituido en la migración 0008 (estimación pendiente de verificar)"

# code, g CO2/km (tubo de escape por vehículo; ELECTRIC = consumo × factor de la red), ocupantes máx., fuente
VEHICLE_TYPES = [
    ("COMPACT", 150.0, 5, _EPA),
    ("SEDAN", 192.0, 5, _EPA),
    ("SUV", 250.0, 7, _EPA),
    ("PICKUP", 290.0, 5, _EPA),
    ("MINIVAN", 230.0, 8, _EPA),
    ("HYBRID", 110.0, 5, _EPA),
    ("ELECTRIC", 75.0, 5, _CRE),
]


def upgrade() -> None:
    VEHICLE_TYPE.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "vehicle_types",
        sa.Column("code", VEHICLE_TYPE, primary_key=True),
        sa.Column("grams_per_km", sa.Float(), nullable=False),
        sa.Column("max_occupants", sa.SmallInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("source", sa.String(300), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("grams_per_km >= 0 AND grams_per_km <= 5000", name="ck_vehicle_types_factor"),
        sa.CheckConstraint("max_occupants BETWEEN 1 AND 8", name="ck_vehicle_types_max_occupants"),
    )
    conn = op.get_bind()
    for code, grams, occ, source in VEHICLE_TYPES:
        conn.execute(
            sa.text("INSERT INTO vehicle_types (code, grams_per_km, max_occupants, source) "
                    "VALUES (CAST(:c AS vehicle_type), :g, :o, :s)"),
            {"c": code, "g": grams, "o": occ, "s": source},
        )

    op.add_column("trips", sa.Column("vehicle_type", VEHICLE_TYPE, nullable=True))
    op.add_column("trips", sa.Column("occupants", sa.SmallInteger(), nullable=True))
    op.create_foreign_key("fk_trips_vehicle_type_vehicle_types", "trips", "vehicle_types",
                          ["vehicle_type"], ["code"], ondelete="RESTRICT")
    op.create_check_constraint("ck_trips_occupants_range", "trips", "occupants IS NULL OR occupants BETWEEN 1 AND 8")
    op.create_check_constraint("ck_trips_vehicle_only_car", "trips",
                               "mode IN ('CAR', 'CARPOOL') OR (vehicle_type IS NULL AND occupants IS NULL)")
    op.create_check_constraint("ck_trips_carpool_occupants", "trips",
                               "mode <> 'CARPOOL' OR occupants IS NULL OR occupants >= 2")

    op.add_column("user_preferences", sa.Column("default_vehicle_type", VEHICLE_TYPE, nullable=True))
    op.create_foreign_key("fk_user_preferences_default_vehicle_type_vehicle_types", "user_preferences",
                          "vehicle_types", ["default_vehicle_type"], ["code"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_user_preferences_default_vehicle_type_vehicle_types", "user_preferences",
                       type_="foreignkey")
    op.drop_column("user_preferences", "default_vehicle_type")
    for name in ("ck_trips_carpool_occupants", "ck_trips_vehicle_only_car", "ck_trips_occupants_range"):
        op.drop_constraint(name, "trips", type_="check")
    op.drop_constraint("fk_trips_vehicle_type_vehicle_types", "trips", type_="foreignkey")
    op.drop_column("trips", "occupants")
    op.drop_column("trips", "vehicle_type")
    op.drop_table("vehicle_types")
    VEHICLE_TYPE.drop(op.get_bind(), checkfirst=True)
