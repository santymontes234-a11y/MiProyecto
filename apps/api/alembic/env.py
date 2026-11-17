from logging.config import fileConfig

from geoalchemy2 import alembic_helpers
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401  (registra todos los modelos)
from alembic import context
from app.core.config import get_settings
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Misma configuración que la app (POSTGRES_* o DATABASE_URL_OVERRIDE); nunca credenciales en alembic.ini.
url = get_settings().database_url
config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))

target_metadata = Base.metadata

# Tablas propias de PostGIS que no deben ser gestionadas por las migraciones.
_POSTGIS_TABLES = {"spatial_ref_sys", "geography_columns", "geometry_columns", "raster_columns", "raster_overviews"}


# Índices de expresión en public que crea geo.rebuild_adapters() (migración 0003): no son del ORM.
_GEO_PUBLIC_INDEXES = {
    "ix_trips_geo_origin_utm", "ix_trips_geo_dest_utm", "ix_trips_geo_route_utm",
    "ix_trips_geo_mode_started", "ix_cycleways_geo_utm", "ix_pois_geo_utm",
}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "index" and name in _GEO_PUBLIC_INDEXES:
        return False
    schema = getattr(obj, "schema", None)
    if schema not in (None, "public"):
        return False  # el esquema `geo` se gestiona con op.execute en sus propias migraciones
    if type_ == "table" and (name in _POSTGIS_TABLES or (reflected and compare_to is None)):
        # Ignora tablas ajenas al modelo (PostGIS, tiger geocoder, etc.).
        return False
    return alembic_helpers.include_object(obj, name, type_, reflected, compare_to)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
        process_revision_directives=alembic_helpers.writer,
        render_item=alembic_helpers.render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            process_revision_directives=alembic_helpers.writer,
            render_item=alembic_helpers.render_item,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
