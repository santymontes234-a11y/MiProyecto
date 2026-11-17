#!/bin/bash
# Producción: crea el rol de la aplicación SIN privilegios de superusuario y lo hace dueño de la BD.
# Se ejecuta UNA sola vez, cuando el volumen de datos está vacío (docker-entrypoint-initdb.d).
#   POSTGRES_USER/POSTGRES_PASSWORD (del contenedor) = administrador (superusuario, solo mantenimiento)
#   APP_DB_USER/APP_DB_PASSWORD                       = rol que usan la API y las migraciones
set -euo pipefail
: "${APP_DB_USER:?APP_DB_USER es obligatorio}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD es obligatorio}"
if [ "$APP_DB_USER" = "$POSTGRES_USER" ]; then
  echo "APP_DB_USER debe ser distinto del usuario administrador" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_pw="$APP_DB_PASSWORD" -v db="$POSTGRES_DB" <<'SQL'
SET password_encryption = 'scram-sha-256';
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 40 PASSWORD :'app_pw';
-- Dueño de la BD: en PostgreSQL 15+ el esquema public pertenece a pg_database_owner,
-- así que el rol puede crear tablas (migraciones Alembic) sin ser superusuario.
ALTER DATABASE :"db" OWNER TO :"app_user";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"app_user";
-- Extensiones que exigen superusuario (las migraciones solo hacen CREATE EXTENSION IF NOT EXISTS).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Evita que la plantilla template1 o "postgres" sean accesibles por el rol de la app.
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
SQL
echo "Rol de aplicación '$APP_DB_USER' creado (sin superusuario) y dueño de '$POSTGRES_DB'."
