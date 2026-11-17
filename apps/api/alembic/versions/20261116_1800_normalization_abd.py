"""normalization abd

Normalización (requisito R5 de la materia ABD) y contrato 1.1.1 §5.1:

1. `ref` de OpenStreetMap: el importador guardaba la etiqueta `ref` de OSM como `attributes.code`, y
   `ref` no es única (una parada en cada sentido comparte `ref`). Se renombra a `ref` en todos los POIs
   con `source = 'osm'`. `code` queda reservado al código OFICIAL asignado por un admin.
2. `users.preferences` (JSONB) → tabla `user_preferences` (1:1).
3. Especialización EER disjunta y parcial de `pois`:
   `transit_stops` (BUS_STOP: code oficial único, osm_ref no único), `bike_stations`
   (BIKE_SHARING/BIKE_PARKING: code, capacity), `transit_lines` y `stop_lines` (N:M).
   La disyunción la garantiza la FK compuesta (poi_id, category) → pois(id, category) + CHECK.
   Los datos se migran desde `pois.attributes` y esas claves se eliminan del JSONB.

Idempotente sobre BD ya importadas: no falla con `code` duplicados (el primero conserva el código
oficial; los demás quedan en NULL y su valor se conserva en `osm_ref`).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-16 18:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

POI_CATEGORY = postgresql.ENUM(name="poi_category", create_type=False)
TRANSPORT_MODE = postgresql.ENUM(name="transport_mode", create_type=False)
CODE_RE = "^[A-Z0-9_-]{2,32}$"


def upgrade() -> None:
    # --- 1. ref de OSM fuera de `code` (contrato 1.1.1 §5.1) ---
    op.execute(
        "UPDATE pois SET attributes = (attributes - 'code') || jsonb_build_object('ref', attributes->'code') "
        "WHERE attributes->>'source' = 'osm' AND attributes ? 'code'"
    )

    # --- 2. user_preferences ---
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("language", sa.String(length=2), server_default="es", nullable=False),
        sa.Column("default_mode", TRANSPORT_MODE, nullable=True),
        sa.Column("weekly_goal_trips", sa.SmallInteger(), nullable=True),
        sa.Column("email_notifications", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("language IN ('es', 'en')", name="ck_user_preferences_language"),
        sa.CheckConstraint("weekly_goal_trips IS NULL OR weekly_goal_trips BETWEEN 1 AND 100",
                           name="ck_user_preferences_weekly_goal"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.execute(f"""
        INSERT INTO user_preferences (user_id, language, default_mode, weekly_goal_trips, email_notifications)
        SELECT u.id,
               CASE WHEN u.preferences->>'language' IN ('es', 'en') THEN u.preferences->>'language' ELSE 'es' END,
               CASE WHEN u.preferences->>'default_mode' IN
                         ('WALK','BICYCLE','E_SCOOTER','BUS','CARPOOL','MOTORCYCLE','CAR')
                    THEN (u.preferences->>'default_mode')::transport_mode END,
               CASE WHEN u.preferences->>'weekly_goal_trips' ~ '^[0-9]{{1,3}}$'
                         AND (u.preferences->>'weekly_goal_trips')::int BETWEEN 1 AND 100
                    THEN (u.preferences->>'weekly_goal_trips')::smallint END,
               COALESCE(CASE WHEN jsonb_typeof(u.preferences->'email_notifications') = 'boolean'
                             THEN (u.preferences->>'email_notifications')::boolean END, true)
        FROM users u
    """)
    op.drop_column("users", "preferences")

    # --- 3. Especialización de pois ---
    op.create_unique_constraint("uq_pois_id_category", "pois", ["id", "category"])

    op.create_table(
        "transit_lines",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9 ._-]{1,32}$'", name="ck_transit_lines_code_format"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "transit_stops",
        sa.Column("poi_id", sa.UUID(), nullable=False),
        sa.Column("category", POI_CATEGORY, server_default="BUS_STOP", nullable=False),
        sa.Column("code", sa.String(length=32), nullable=True),
        sa.Column("osm_ref", sa.String(length=64), nullable=True),
        sa.CheckConstraint("category = 'BUS_STOP'", name="ck_transit_stops_category"),
        sa.CheckConstraint(f"code ~ '{CODE_RE}'", name="ck_transit_stops_code_format"),
        sa.ForeignKeyConstraint(["poi_id", "category"], ["pois.id", "pois.category"],
                                name="fk_transit_stops_poi", ondelete="CASCADE", onupdate="CASCADE"),
        sa.PrimaryKeyConstraint("poi_id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "stop_lines",
        sa.Column("stop_id", sa.UUID(), nullable=False),
        sa.Column("line_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["line_id"], ["transit_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stop_id"], ["transit_stops.poi_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("stop_id", "line_id"),
    )
    op.create_index("ix_stop_lines_line", "stop_lines", ["line_id"], unique=False)
    op.create_table(
        "bike_stations",
        sa.Column("poi_id", sa.UUID(), nullable=False),
        sa.Column("category", POI_CATEGORY, nullable=False),
        sa.Column("code", sa.String(length=32), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.CheckConstraint("category IN ('BIKE_SHARING', 'BIKE_PARKING')", name="ck_bike_stations_category"),
        sa.CheckConstraint(f"code ~ '{CODE_RE}'", name="ck_bike_stations_code_format"),
        sa.CheckConstraint("capacity IS NULL OR capacity BETWEEN 1 AND 10000", name="ck_bike_stations_capacity"),
        sa.ForeignKeyConstraint(["poi_id", "category"], ["pois.id", "pois.category"],
                                name="fk_bike_stations_poi", ondelete="CASCADE", onupdate="CASCADE"),
        sa.PrimaryKeyConstraint("poi_id"),
        sa.UniqueConstraint("code"),
    )

    # Paradas: el código oficial (válido y no repetido) se conserva en el primer POI que lo tenía; los
    # demás quedan con code NULL. El ref de OSM pasa a osm_ref.
    op.execute(f"""
        WITH ranked AS (
            SELECT id, attributes,
                   row_number() OVER (PARTITION BY attributes->>'code' ORDER BY created_at, id) AS rn
            FROM pois WHERE category = 'BUS_STOP'
        )
        INSERT INTO transit_stops (poi_id, category, code, osm_ref)
        SELECT id, 'BUS_STOP',
               CASE WHEN rn = 1 AND attributes->>'code' ~ '{CODE_RE}' THEN attributes->>'code' END,
               left(COALESCE(attributes->>'ref',
                             CASE WHEN rn > 1 OR NOT (attributes->>'code' ~ '{CODE_RE}')
                                  THEN attributes->>'code' END), 64)
        FROM ranked
    """)
    op.execute("""
        INSERT INTO transit_lines (id, code, name)
        SELECT gen_random_uuid(), l.code, l.code
        FROM (SELECT DISTINCT left(trim(x), 32) AS code
              FROM pois p, jsonb_array_elements_text(
                       CASE WHEN jsonb_typeof(p.attributes->'lines') = 'array' THEN p.attributes->'lines' ELSE '[]' END
                   ) AS x
              WHERE p.category = 'BUS_STOP') l
        WHERE l.code ~ '^[A-Za-z0-9 ._-]{1,32}$'
    """)
    op.execute("""
        INSERT INTO stop_lines (stop_id, line_id)
        SELECT DISTINCT p.id, tl.id
        FROM pois p
        CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p.attributes->'lines') = 'array' THEN p.attributes->'lines' ELSE '[]' END
        ) AS x
        JOIN transit_lines tl ON tl.code = left(trim(x), 32)
        WHERE p.category = 'BUS_STOP'
    """)
    op.execute("UPDATE pois SET attributes = attributes - 'code' - 'ref' - 'lines' WHERE category = 'BUS_STOP'")

    op.execute(f"""
        WITH ranked AS (
            SELECT id, category, attributes,
                   row_number() OVER (PARTITION BY attributes->>'code' ORDER BY created_at, id) AS rn
            FROM pois WHERE category IN ('BIKE_SHARING', 'BIKE_PARKING')
        )
        INSERT INTO bike_stations (poi_id, category, code, capacity)
        SELECT id, category,
               CASE WHEN rn = 1 AND attributes->>'code' ~ '{CODE_RE}' THEN attributes->>'code' END,
               CASE WHEN attributes->>'capacity' ~ '^[0-9]{{1,5}}$'
                         AND (attributes->>'capacity')::int BETWEEN 1 AND 10000
                    THEN (attributes->>'capacity')::int END
        FROM ranked
    """)
    op.execute("""
        UPDATE pois SET attributes = attributes - 'code'
               - (CASE WHEN attributes->>'capacity' ~ '^[0-9]{1,5}$'
                            AND (attributes->>'capacity')::int BETWEEN 1 AND 10000
                       THEN 'capacity' ELSE '' END)
        WHERE category IN ('BIKE_SHARING', 'BIKE_PARKING')
    """)


def downgrade() -> None:
    # Devuelve los atributos al JSONB de pois y las preferencias a users.preferences.
    op.execute("""
        UPDATE pois p SET attributes = p.attributes
            || CASE WHEN s.code IS NOT NULL THEN jsonb_build_object('code', s.code) ELSE '{}' END
            || CASE WHEN s.osm_ref IS NOT NULL THEN jsonb_build_object('ref', s.osm_ref) ELSE '{}' END
            || COALESCE((SELECT jsonb_build_object('lines', jsonb_agg(tl.code ORDER BY tl.code))
                         FROM stop_lines sl JOIN transit_lines tl ON tl.id = sl.line_id
                         WHERE sl.stop_id = s.poi_id), '{}')
        FROM transit_stops s WHERE s.poi_id = p.id
    """)
    op.execute("""
        UPDATE pois p SET attributes = p.attributes
            || CASE WHEN b.code IS NOT NULL THEN jsonb_build_object('code', b.code) ELSE '{}' END
            || CASE WHEN b.capacity IS NOT NULL THEN jsonb_build_object('capacity', b.capacity) ELSE '{}' END
        FROM bike_stations b WHERE b.poi_id = p.id
    """)
    op.drop_table("bike_stations")
    op.drop_index("ix_stop_lines_line", table_name="stop_lines")
    op.drop_table("stop_lines")
    op.drop_table("transit_stops")
    op.drop_table("transit_lines")
    op.drop_constraint("uq_pois_id_category", "pois", type_="unique")

    op.add_column("users", sa.Column("preferences", postgresql.JSONB(astext_type=sa.Text()),
                                     server_default=sa.text("'{}'::jsonb"), nullable=False))
    op.execute("""
        UPDATE users u SET preferences = jsonb_strip_nulls(jsonb_build_object(
            'language', p.language, 'default_mode', p.default_mode,
            'weekly_goal_trips', p.weekly_goal_trips, 'email_notifications', p.email_notifications))
        FROM user_preferences p WHERE p.user_id = u.id
    """)
    op.drop_table("user_preferences")
    # El renombrado code → ref de OSM (paso 1) no se revierte: era un error de datos.
