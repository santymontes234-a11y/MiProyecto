#!/usr/bin/env bash
# Restaura un backup creado por backup.sh EN ESTE SERVIDOR.
#
# Uso:
#   infrastructure/scripts/restore.sh <carpeta-de-backup>              # restaura la base de datos
#   infrastructure/scripts/restore.sh <carpeta-de-backup> --config     # además extrae la configuración
#                                                                      # a una carpeta de revisión (no sobrescribe /etc)
#   Opciones: --no-safety-backup   --yes (sin confirmación interactiva; peligroso)
#
# Pasos (base de datos):
#   1. Verifica sumas SHA-256 y que pg_restore pueda leer el dump.
#   2. Hace un backup de seguridad del estado ACTUAL (salvo --no-safety-backup).
#   3. Detiene api y web (la BD sigue en marcha).
#   4. Elimina y recrea la base de datos (dueño: rol de la aplicación) y ejecuta pg_restore.
#   5. Ejecuta las migraciones pendientes (por si el backup es de una versión anterior).
#   6. Arranca api y web y comprueba /api/v1/health.
# ¡DESTRUCTIVO! Todo lo escrito después del backup se pierde.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SRC=""; WITH_CONFIG=0; SAFETY=1
while [ $# -gt 0 ]; do
  case "$1" in
    --config) WITH_CONFIG=1; shift ;;
    --no-safety-backup) SAFETY=0; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    -*) die "Opción desconocida: $1" ;;
    *) SRC="$1"; shift ;;
  esac
done
[ -n "$SRC" ] || die "Indica la carpeta del backup (ls \$BACKUP_DIR)."
SRC="$(cd "$SRC" && pwd)"
require_cmd docker
require_env_file
check_env_placeholders

DB_NAME="$(env_get POSTGRES_DB ecomove)"
DB_ADMIN="$(env_get POSTGRES_ADMIN_USER)"
DB_APP="$(env_get POSTGRES_USER)"
API_PORT="$(env_get API_HOST_PORT 8000)"

[ -f "$SRC/db.dump" ] || die "No hay db.dump en $SRC"
compose up -d --wait db
"$ROOT_DIR/infrastructure/scripts/backup.sh" --verify "$SRC"

echo
cat "$SRC/MANIFEST.txt" 2>/dev/null | head -5 || true
echo
warn "Se REEMPLAZARÁ la base de datos '$DB_NAME' por el contenido de $SRC."
confirm "Confirma la restauración" "RESTAURAR"

if [ "$SAFETY" = "1" ]; then
  log "Backup de seguridad del estado actual"
  "$ROOT_DIR/infrastructure/scripts/backup.sh" --db-only --tag pre-restore
fi

log "Deteniendo api y web"
compose stop api web || true

log "Recreando la base de datos '$DB_NAME'"
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_ADMIN" -d postgres \
  -v db="$DB_NAME" -v app="$DB_APP" <<'SQL'
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
CREATE DATABASE :"db" OWNER :"app";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"app";
SQL

log "pg_restore (como administrador; conserva los dueños originales)"
compose exec -T db pg_restore -U "$DB_ADMIN" -d "$DB_NAME" --exit-on-error --no-password < "$SRC/db.dump"

log "Migraciones pendientes"
compose run --rm migrate

log "Arrancando api y web"
compose up -d --wait api web
wait_http "http://127.0.0.1:${API_PORT}/api/v1/health" 45 || die "La API no responde tras restaurar"
ok "Base de datos restaurada desde $SRC"

if [ "$WITH_CONFIG" = "1" ] && [ -f "$SRC/config.tar.gz" ]; then
  out="$ROOT_DIR/restore-config-$(date +%Y%m%d%H%M%S)"
  install -d -m 700 "$out"
  tar -xzf "$SRC/config.tar.gz" -C "$out" --no-same-owner
  ok "Configuración extraída en $out (revísala y cópiala a mano; contiene secretos: bórrala al terminar)."
fi
