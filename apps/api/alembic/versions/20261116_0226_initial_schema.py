"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-16 02:26:19.815816+00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ENUMS = {
    "user_role": ("USER", "ADMIN", "SUPER_ADMIN"),
    "transport_mode": ("WALK", "BICYCLE", "E_SCOOTER", "BUS", "CARPOOL", "MOTORCYCLE", "CAR"),
    "trip_status": ("COMPLETED", "CANCELLED"),
    "poi_category": ("BIKE_PARKING", "BIKE_SHARING", "BUS_STOP", "EV_CHARGER", "REPAIR_STATION"),
}


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    bind = op.get_bind()
    for name, values in ENUMS.items():
        postgresql.ENUM(*values, name=name).create(bind, checkfirst=True)

    op.create_geospatial_table('cycleways',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=True),
    sa.Column('is_protected', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('osm_id', sa.BigInteger(), nullable=True),
    sa.Column('geom', Geometry(geometry_type='LINESTRING', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('osm_id')
    )
    op.create_geospatial_index('ix_cycleways_geom', 'cycleways', ['geom'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_table('permissions',
    sa.Column('code', sa.String(length=64), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=False),
    sa.PrimaryKeyConstraint('code')
    )
    op.create_geospatial_table('pois',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('category', postgresql.ENUM('BIKE_PARKING', 'BIKE_SHARING', 'BUS_STOP', 'EV_CHARGER', 'REPAIR_STATION', name='poi_category', create_type=False), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('attributes', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('location', Geometry(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_pois_category', 'pois', ['category'], unique=False)
    op.create_geospatial_index('ix_pois_location', 'pois', ['location'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_table('roles',
    sa.Column('name', postgresql.ENUM('USER', 'ADMIN', 'SUPER_ADMIN', name='user_role', create_type=False), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=False),
    sa.Column('level', sa.SmallInteger(), nullable=False),
    sa.PrimaryKeyConstraint('name')
    )
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=120), nullable=False),
    sa.Column('role', postgresql.ENUM('USER', 'ADMIN', 'SUPER_ADMIN', name='user_role', create_type=False), server_default='USER', nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
    sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('email = lower(email)', name='ck_users_email_lowercase'),
    sa.CheckConstraint('failed_login_attempts >= 0', name='ck_users_failed_attempts_positive'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )
    op.create_index('ix_users_role_active', 'users', ['role', 'is_active'], unique=False)
    op.create_table('audit_logs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('actor_id', sa.UUID(), nullable=True),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('entity_type', sa.String(length=32), nullable=False),
    sa.Column('entity_id', sa.UUID(), nullable=True),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'], unique=False)
    op.create_index('ix_audit_logs_actor_created', 'audit_logs', ['actor_id', 'created_at'], unique=False)
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'], unique=False)
    op.create_table('emission_factors',
    sa.Column('mode', postgresql.ENUM('WALK', 'BICYCLE', 'E_SCOOTER', 'BUS', 'CARPOOL', 'MOTORCYCLE', 'CAR', name='transport_mode', create_type=False), nullable=False),
    sa.Column('grams_per_km', sa.Float(), nullable=False),
    sa.Column('valid_from', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_by', sa.UUID(), nullable=True),
    sa.CheckConstraint('grams_per_km >= 0', name='ck_emission_factors_positive'),
    sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('mode')
    )
    op.create_table('refresh_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('family_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.CHAR(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('replaced_by_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_refresh_tokens_family_id'), 'refresh_tokens', ['family_id'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_table('role_permissions',
    sa.Column('role', postgresql.ENUM('USER', 'ADMIN', 'SUPER_ADMIN', name='user_role', create_type=False), nullable=False),
    sa.Column('permission_code', sa.String(length=64), nullable=False),
    sa.ForeignKeyConstraint(['permission_code'], ['permissions.code'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['role'], ['roles.name'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('role', 'permission_code')
    )
    op.create_geospatial_table('trips',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('client_trip_id', sa.UUID(), nullable=False),
    sa.Column('mode', postgresql.ENUM('WALK', 'BICYCLE', 'E_SCOOTER', 'BUS', 'CARPOOL', 'MOTORCYCLE', 'CAR', name='transport_mode', create_type=False), nullable=False),
    sa.Column('status', postgresql.ENUM('COMPLETED', 'CANCELLED', name='trip_status', create_type=False), server_default='COMPLETED', nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('distance_m', sa.Float(), nullable=False),
    sa.Column('duration_s', sa.Integer(), nullable=False),
    sa.Column('route', Geometry(geometry_type='LINESTRING', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('emission_factor_g_per_km', sa.Float(), nullable=False),
    sa.Column('co2_emitted_g', sa.Float(), nullable=False),
    sa.Column('co2_saved_g', sa.Float(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('co2_emitted_g >= 0 AND co2_saved_g >= 0', name='ck_trips_co2_positive'),
    sa.CheckConstraint('distance_m >= 0 AND duration_s > 0', name='ck_trips_distance_duration'),
    sa.CheckConstraint('ended_at > started_at', name='ck_trips_time_order'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'client_trip_id', name='uq_trips_user_client_trip')
    )
    op.create_geospatial_index('ix_trips_route', 'trips', ['route'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_index('ix_trips_started', 'trips', ['started_at'], unique=False)
    op.create_index('ix_trips_user_started', 'trips', ['user_id', sa.literal_column('started_at DESC')], unique=False)


def downgrade() -> None:
    op.drop_index('ix_trips_user_started', table_name='trips')
    op.drop_index('ix_trips_started', table_name='trips')
    op.drop_geospatial_index('ix_trips_route', table_name='trips', postgresql_using='gist', column_name='route')
    op.drop_geospatial_table('trips')
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_family_id'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_table('emission_factors')
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_actor_created', table_name='audit_logs')
    op.drop_index('ix_audit_logs_action', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('ix_users_role_active', table_name='users')
    op.drop_table('users')
    op.drop_table('roles')
    op.drop_geospatial_index('ix_pois_location', table_name='pois', postgresql_using='gist', column_name='location')
    op.drop_index('ix_pois_category', table_name='pois')
    op.drop_geospatial_table('pois')
    op.drop_table('permissions')
    op.drop_geospatial_index('ix_cycleways_geom', table_name='cycleways', postgresql_using='gist', column_name='geom')
    op.drop_geospatial_table('cycleways')
    bind = op.get_bind()
    for name in ENUMS:
        postgresql.ENUM(name=name).drop(bind, checkfirst=True)
