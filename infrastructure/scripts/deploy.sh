#!/usr/bin/env bash
# Despliega (o actualiza) EcoMove Querétaro EN ESTE SERVIDOR con Docker Compose.
# No se conecta a ningún otro host: ejecútalo dentro del VPS, en la carpeta del repositorio.
#
# Uso:
#   infrastructure/scripts/deploy.sh                 # despliega el commit actual del repositorio
#   infrastructure/scripts/deploy.sh --pull          # git pull --ff-only antes de desplegar
#   infrastructure/scripts/deploy.sh --rollback      # vuelve a las imágenes del despliegue anterior
#   infrastructure/scripts/deploy.sh --rollback <tag>
#   Opciones: --skip-backup  --with-routing  --allow-example-domain (solo pruebas locales)
#
# Pasos de un despliegue normal:
#   1. Comprobaciones (.env.production sin "change-me", Docker disponible).
#   2. [--pull] Actualiza el código con git pull --ff-only.
#   3. Backup previo de la base de datos (si ya está en marcha).
#   4. Construye ecomove/api:<commit> y ecomove/web:<commit>.
#   5. Arranca la BD, ejecuta las migraciones (alembic upgrade head) en un contenedor efímero.
#   6. Arranca/actualiza api y web y espera a que estén "healthy".
#   7. Verifica /api/v1/health y la web en 127.0.0.1; guarda el tag en .deploy/.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PULL=0; SKIP_BACKUP=0; ROLLBACK=0; ROLLBACK_TAG=""; ALLOW_EXAMPLE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pull) PULL=1; shift ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    --with-routing) export COMPOSE_PROFILES=routing; shift ;;
    --allow-example-domain) ALLOW_EXAMPLE=1; shift ;;
    --rollback)
      ROLLBACK=1; shift
      if [ $# -gt 0 ] && [[ "$1" != --* ]]; then ROLLBACK_TAG="$1"; shift; fi ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done

require_cmd docker git curl
docker compose version >/dev/null 2>&1 || die "Falta el plugin docker compose."
require_env_file
check_env_placeholders
if [ "$(env_get DOMAIN)" = "example.com" ] && [ "$ALLOW_EXAMPLE" != "1" ]; then
  die "DOMAIN=example.com en $ENV_FILE. Pon tu dominio real (o --allow-example-domain para pruebas locales)."
fi
mkdir -p "$DEPLOY_STATE_DIR"
API_PORT="$(env_get API_HOST_PORT 8000)"
WEB_PORT="$(env_get WEB_HOST_PORT 3000)"

verify() {
  log "Verificando servicios en 127.0.0.1"
  wait_http "http://127.0.0.1:${API_PORT}/api/v1/health" 45 || { compose logs --tail 80 api; die "La API no responde en /api/v1/health"; }
  ok "API: $(curl -fsS "http://127.0.0.1:${API_PORT}/api/v1/health")"
  wait_http "http://127.0.0.1:${WEB_PORT}/" 45 || { compose logs --tail 80 web; die "La web no responde"; }
  ok "Web: HTTP $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/")"
}

if [ "$ROLLBACK" = "1" ]; then
  current="$(cat "$DEPLOY_STATE_DIR/current" 2>/dev/null || true)"
  if [ -z "$ROLLBACK_TAG" ]; then
    ROLLBACK_TAG="$(awk '{print $2}' "$DEPLOY_STATE_DIR/history" 2>/dev/null | grep -vx "${current:-__none__}" | tail -n 1 || true)"
  fi
  [ -n "$ROLLBACK_TAG" ] || die "No hay un despliegue anterior registrado en $DEPLOY_STATE_DIR/history."
  docker image inspect "ecomove/api:$ROLLBACK_TAG" >/dev/null 2>&1 || die "No existe la imagen ecomove/api:$ROLLBACK_TAG"
  docker image inspect "ecomove/web:$ROLLBACK_TAG" >/dev/null 2>&1 || die "No existe la imagen ecomove/web:$ROLLBACK_TAG"
  warn "Rollback de imágenes: ${current:-?} → $ROLLBACK_TAG. Las migraciones de BD NO se revierten (ver docs/deployment/ROLLBACK.md)."
  confirm "¿Hacer rollback a $ROLLBACK_TAG?" "si"
  # --no-deps: no se vuelve a ejecutar 'migrate' con código antiguo (fallaría ante una revisión más nueva).
  IMAGE_TAG="$ROLLBACK_TAG" compose up -d --no-deps --no-build api web
  verify
  echo "$ROLLBACK_TAG" > "$DEPLOY_STATE_DIR/current"
  printf '%s %s rollback\n' "$(date -u +%FT%TZ)" "$ROLLBACK_TAG" >> "$DEPLOY_STATE_DIR/history"
  ok "Rollback completado a $ROLLBACK_TAG"
  exit 0
fi

cd "$ROOT_DIR"
if [ "$PULL" = "1" ]; then
  log "Actualizando código (git pull --ff-only)"
  git pull --ff-only
fi
TAG="$(git rev-parse --short=12 HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  TAG="${TAG}-dirty"
  warn "Hay cambios sin commit en el repositorio; la imagen se etiqueta $TAG."
fi
export IMAGE_TAG="$TAG"
log "Desplegando $TAG ($(git log -1 --format='%s' | cut -c1-70))"

if [ "$SKIP_BACKUP" != "1" ] && [ -n "$(compose ps -q db 2>/dev/null)" ]; then
  log "Backup previo de la base de datos"
  "$ROOT_DIR/infrastructure/scripts/backup.sh" --db-only --tag "pre-deploy-$TAG"
fi

log "Construyendo imágenes ecomove/api:$TAG y ecomove/web:$TAG"
compose build api web

log "Base de datos"
compose up -d --wait db

log "Migraciones (alembic upgrade head)"
compose run --rm migrate

log "Arrancando api y web"
compose up -d --wait --remove-orphans api web
if [ "${COMPOSE_PROFILES:-}" = "routing" ]; then
  log "Arrancando OSRM (la primera vez descarga ~700 MB y tarda varios minutos)"
  compose up -d osrm-foot osrm-bicycle osrm-car
fi

verify
echo "$TAG" > "$DEPLOY_STATE_DIR/current"
printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$TAG" "$(git rev-parse HEAD)" >> "$DEPLOY_STATE_DIR/history"

# Conserva la versión actual + las 4 anteriores (para rollback); borra imágenes más antiguas.
for repo in ecomove/api ecomove/web; do
  { docker image ls "$repo" --format '{{.Tag}}' | grep -vx -e latest -e "$TAG" || true; } | tail -n +5 \
    | while read -r old; do docker image rm "$repo:$old" >/dev/null 2>&1 || true; done
done

ok "Despliegue $TAG completado."
echo "Comprueba desde fuera: https://$(env_get DOMAIN) y https://$(env_get API_DOMAIN)/api/v1/health"
