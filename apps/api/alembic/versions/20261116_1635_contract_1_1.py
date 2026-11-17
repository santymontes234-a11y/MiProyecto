"""contract 1.1: cuenta, gamificación, notificaciones, reportes

Tablas y columnas del contrato 1.1.0 (propuesta backend rev. 4). Incluye semillas de
transport_modes, logros y permisos (anexo A), y el backfill de trips.points y de las sesiones.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-16 16:35:32.281676+00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


NEW_ENUMS = {
    "achievement_criterion": ("TRIPS_COUNT", "DISTANCE_M", "CO2_SAVED_G", "DISTINCT_MODES"),
    "citizen_report_category": ("BIKE_LANE_DAMAGE", "MISSING_INFRASTRUCTURE", "SAFETY", "POI_ISSUE", "OTHER"),
    "citizen_report_status": ("OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"),
    "notification_type": ("ACHIEVEMENT_UNLOCKED", "WEEKLY_SUMMARY", "SYSTEM"),
    "report_type": ("overview", "trips", "users", "co2_by_mode", "co2_by_zone", "analytics_timeseries",
                    "citizen_reports", "audit_logs"),
    "report_format": ("csv", "pdf"),
    "token_purpose": ("PASSWORD_RESET", "EMAIL_VERIFICATION"),
    "trip_source": ("GPS", "PLANNED"),
}

# Velocidad media máxima plausible por medio (km/h).
TRANSPORT_MODES = {"WALK": 15, "BICYCLE": 50, "E_SCOOTER": 40, "BUS": 100, "CARPOOL": 160,
                   "MOTORCYCLE": 180, "CAR": 180}

# (code, name, description, icon, criterion, threshold, bonus_points)
ACHIEVEMENTS = [
    ("FIRST_TRIP", "Primer viaje", "Registra tu primer viaje", "flag", "TRIPS_COUNT", 1, 50),
    ("TRIPS_10", "Constancia", "Registra 10 viajes", "repeat", "TRIPS_COUNT", 10, 100),
    ("TRIPS_50", "Hábito verde", "Registra 50 viajes", "leaf", "TRIPS_COUNT", 50, 300),
    ("DISTANCE_100KM", "100 kilómetros", "Recorre 100 km en tus viajes", "route", "DISTANCE_M", 100000, 200),
    ("CO2_10KG", "10 kg de CO₂", "Evita 10 kg de CO₂", "cloud", "CO2_SAVED_G", 10000, 150),
    ("CO2_100KG", "100 kg de CO₂", "Evita 100 kg de CO₂", "globe", "CO2_SAVED_G", 100000, 500),
    ("MULTIMODAL_3", "Explorador multimodal", "Usa 3 medios de transporte distintos", "shuffle",
     "DISTINCT_MODES", 3, 100),
]

# Anexo A del contrato 1.1.0. `map:manage` pasa a llamarse `catalog:manage`.
NEW_PERMISSIONS = {
    "reports:citizen_create": "Crear reportes ciudadanos",
    "trips:read_any": "Consultar viajes de cualquier usuario (sin trazas)",
    "trips:delete_any": "Eliminar viajes de cualquier usuario",
    "catalog:manage": "Gestionar POIs, zonas y logros",
    "citizen_reports:manage": "Gestionar reportes ciudadanos",
    "analytics:read": "Consultar la analítica",
    "reports:export": "Generar y descargar informes",
    "users:delete": "Eliminar cuentas de usuario",
    "transport_modes:write": "Editar medios de transporte",
    "reports:export_audit": "Generar informes de auditoría",
}
GRANTS = {
    "USER": ["reports:citizen_create"],
    "ADMIN": ["reports:citizen_create", "trips:read_any", "trips:delete_any", "catalog:manage",
              "citizen_reports:manage", "analytics:read", "reports:export"],
    "SUPER_ADMIN": ["reports:citizen_create", "trips:read_any", "trips:delete_any", "catalog:manage",
                    "citizen_reports:manage", "analytics:read", "reports:export", "users:delete",
                    "transport_modes:write", "reports:export_audit"],
}


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in NEW_ENUMS.items():
        postgresql.ENUM(*values, name=name).create(bind, checkfirst=True)

    op.create_table('achievements',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('description', sa.String(length=300), nullable=False),
    sa.Column('icon', sa.String(length=40), nullable=False),
    sa.Column('criterion', postgresql.ENUM('TRIPS_COUNT', 'DISTANCE_M', 'CO2_SAVED_G', 'DISTINCT_MODES', name='achievement_criterion', create_type=False), nullable=False),
    sa.Column('threshold', sa.Float(), nullable=False),
    sa.Column('bonus_points', sa.Integer(), server_default='0', nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("code ~ '^[A-Z0-9_]{2,40}$'", name='ck_achievements_code_format'),
    sa.CheckConstraint('bonus_points >= 0 AND bonus_points <= 10000', name='ck_achievements_bonus_range'),
    sa.CheckConstraint('threshold > 0', name='ck_achievements_threshold_positive'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('transport_modes',
    sa.Column('mode', postgresql.ENUM('WALK', 'BICYCLE', 'E_SCOOTER', 'BUS', 'CARPOOL', 'MOTORCYCLE', 'CAR', name='transport_mode', create_type=False), nullable=False),
    sa.Column('max_speed_kmh', sa.Float(), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.CheckConstraint('max_speed_kmh > 0 AND max_speed_kmh <= 300', name='ck_transport_modes_speed'),
    sa.PrimaryKeyConstraint('mode')
    )
    op.create_geospatial_table('citizen_reports',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('reporter_id', sa.UUID(), nullable=True),
    sa.Column('category', postgresql.ENUM('BIKE_LANE_DAMAGE', 'MISSING_INFRASTRUCTURE', 'SAFETY', 'POI_ISSUE', 'OTHER', name='citizen_report_category', create_type=False), nullable=False),
    sa.Column('status', postgresql.ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', name='citizen_report_status', create_type=False), server_default='OPEN', nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('location', Geometry(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('poi_id', sa.UUID(), nullable=True),
    sa.Column('resolution_note', sa.String(length=1000), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['poi_id'], ['pois.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_geospatial_index('ix_citizen_reports_location', 'citizen_reports', ['location'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_index('ix_citizen_reports_reporter_created', 'citizen_reports', ['reporter_id', 'created_at'], unique=False)
    op.create_index('ix_citizen_reports_status_created', 'citizen_reports', ['status', 'created_at'], unique=False)
    op.create_table('notifications',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('type', postgresql.ENUM('ACHIEVEMENT_UNLOCKED', 'WEEKLY_SUMMARY', 'SYSTEM', name='notification_type', create_type=False), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('body', sa.String(length=500), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'], unique=False)
    op.create_index('ix_notifications_user_created', 'notifications', ['user_id', sa.literal_column('created_at DESC')], unique=False)
    op.create_index('ix_notifications_user_unread', 'notifications', ['user_id'], unique=False, postgresql_where=sa.text('read_at IS NULL'))
    op.create_table('reports',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('report_type', postgresql.ENUM('overview', 'trips', 'users', 'co2_by_mode', 'co2_by_zone', 'analytics_timeseries', 'citizen_reports', 'audit_logs', name='report_type', create_type=False), nullable=False),
    sa.Column('format', postgresql.ENUM('csv', 'pdf', name='report_format', create_type=False), nullable=False),
    sa.Column('parameters', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('row_count', sa.Integer(), nullable=False),
    sa.Column('content', sa.LargeBinary(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('row_count >= 0', name='ck_reports_row_count_positive'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reports_created_at', 'reports', ['created_at'], unique=False)
    op.create_index(op.f('ix_reports_created_by'), 'reports', ['created_by'], unique=False)
    op.create_table('user_achievements',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('achievement_id', sa.UUID(), nullable=False),
    sa.Column('bonus_points', sa.Integer(), server_default='0', nullable=False),
    sa.Column('awarded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['achievement_id'], ['achievements.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'achievement_id', name='uq_user_achievements_user_achievement')
    )
    op.create_index('ix_user_achievements_awarded_at', 'user_achievements', ['awarded_at'], unique=False)
    op.create_table('user_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('purpose', postgresql.ENUM('PASSWORD_RESET', 'EMAIL_VERIFICATION', name='token_purpose', create_type=False), nullable=False),
    sa.Column('token_hash', sa.CHAR(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('expires_at > created_at', name='ck_user_tokens_expiry'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index('ix_user_tokens_user_purpose', 'user_tokens', ['user_id', 'purpose'], unique=False, postgresql_where=sa.text('used_at IS NULL'))
    op.add_column('refresh_tokens', sa.Column('session_created_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('refresh_tokens', sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('refresh_tokens', sa.Column('user_agent', sa.String(length=255), nullable=True))
    op.add_column('trips', sa.Column('source', postgresql.ENUM('GPS', 'PLANNED', name='trip_source', create_type=False), server_default='GPS', nullable=False))
    op.add_column('trips', sa.Column('points', sa.Integer(), server_default='0', nullable=False))
    op.add_column('trips', sa.Column('recurrence_id', sa.UUID(), nullable=True))
    op.add_column('trips', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.create_index('ix_trips_recurrence', 'trips', ['recurrence_id'], unique=False, postgresql_where=sa.text('recurrence_id IS NOT NULL'))
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('ranking_opt_in', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('users', sa.Column('preferences', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False))
    op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='0', nullable=False))
    op.create_index('ix_users_ranking_opt_in', 'users', ['ranking_opt_in'], unique=False, postgresql_where=sa.text('ranking_opt_in'))

    # --- Backfill de datos existentes ---
    op.execute("UPDATE refresh_tokens SET session_created_at = created_at, last_used_at = created_at "
               "WHERE session_created_at IS NULL")
    op.execute("UPDATE trips SET points = floor(co2_saved_g / 100)::int WHERE status = 'COMPLETED'")
    op.execute("UPDATE trips SET updated_at = created_at")

    # --- Semillas ---
    for mode, speed in TRANSPORT_MODES.items():
        bind.execute(sa.text("INSERT INTO transport_modes (mode, max_speed_kmh, is_active) "
                             "VALUES (CAST(:m AS transport_mode), :s, true)"), {"m": mode, "s": speed})
    for code, name, desc, icon, criterion, threshold, bonus in ACHIEVEMENTS:
        bind.execute(sa.text(
            "INSERT INTO achievements (id, code, name, description, icon, criterion, threshold, bonus_points, is_active) "
            "VALUES (gen_random_uuid(), :c, :n, :d, :i, CAST(:cr AS achievement_criterion), :t, :b, true)"
        ), {"c": code, "n": name, "d": desc, "i": icon, "cr": criterion, "t": threshold, "b": bonus})
    for code, desc in NEW_PERMISSIONS.items():
        bind.execute(sa.text("INSERT INTO permissions (code, description) VALUES (:c, :d)"), {"c": code, "d": desc})
    for role, codes in GRANTS.items():
        for code in codes:
            bind.execute(sa.text("INSERT INTO role_permissions (role, permission_code) "
                                 "VALUES (CAST(:r AS user_role), :c)"), {"r": role, "c": code})
    op.execute("DELETE FROM permissions WHERE code = 'map:manage'")


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("INSERT INTO permissions (code, description) VALUES "
                         "('map:manage', 'Crear, editar y desactivar puntos de interés')"))
    for role in ("ADMIN", "SUPER_ADMIN"):
        bind.execute(sa.text("INSERT INTO role_permissions (role, permission_code) "
                             "VALUES (CAST(:r AS user_role), 'map:manage')"), {"r": role})
    bind.execute(sa.text("DELETE FROM permissions WHERE code = ANY(:c)"), {"c": list(NEW_PERMISSIONS)})
    op.drop_index('ix_users_ranking_opt_in', table_name='users', postgresql_where=sa.text('ranking_opt_in'))
    op.drop_column('users', 'token_version')
    op.drop_column('users', 'preferences')
    op.drop_column('users', 'ranking_opt_in')
    op.drop_column('users', 'email_verified_at')
    op.drop_index('ix_trips_recurrence', table_name='trips', postgresql_where=sa.text('recurrence_id IS NOT NULL'))
    op.drop_column('trips', 'updated_at')
    op.drop_column('trips', 'recurrence_id')
    op.drop_column('trips', 'points')
    op.drop_column('trips', 'source')
    op.drop_column('refresh_tokens', 'user_agent')
    op.drop_column('refresh_tokens', 'last_used_at')
    op.drop_column('refresh_tokens', 'session_created_at')
    op.drop_index('ix_user_tokens_user_purpose', table_name='user_tokens', postgresql_where=sa.text('used_at IS NULL'))
    op.drop_table('user_tokens')
    op.drop_index('ix_user_achievements_awarded_at', table_name='user_achievements')
    op.drop_table('user_achievements')
    op.drop_index(op.f('ix_reports_created_by'), table_name='reports')
    op.drop_index('ix_reports_created_at', table_name='reports')
    op.drop_table('reports')
    op.drop_index('ix_notifications_user_unread', table_name='notifications', postgresql_where=sa.text('read_at IS NULL'))
    op.drop_index('ix_notifications_user_created', table_name='notifications')
    op.drop_index('ix_notifications_created_at', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index('ix_citizen_reports_status_created', table_name='citizen_reports')
    op.drop_index('ix_citizen_reports_reporter_created', table_name='citizen_reports')
    op.drop_geospatial_index('ix_citizen_reports_location', table_name='citizen_reports', postgresql_using='gist', column_name='location')
    op.drop_geospatial_table('citizen_reports')
    op.drop_table('transport_modes')
    op.drop_table('achievements')
    for name in NEW_ENUMS:
        postgresql.ENUM(name=name).drop(bind, checkfirst=True)
