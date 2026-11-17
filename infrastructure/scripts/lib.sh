#!/usr/bin/env bash
# Funciones comunes de los scripts de operación de EcoMove Querétaro. No se ejecuta directamente.
# Todas las operaciones son LOCALES al servidor donde se ejecutan: ningún script se conecta a otro host.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infrastructure/docker-compose.prod.yml}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-$ROOT_DIR/.deploy}"

if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_BLU=$'\033[34m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_YEL=""; C_GRN=""; C_BLU=""; C_OFF=""
fi

log()  { printf '%s[%s]%s %s\n' "$C_BLU" "$(date '+%Y-%m-%d %H:%M:%S')" "$C_OFF" "$*"; }
ok()   { printf '%s✔%s %s\n' "$C_GRN" "$C_OFF" "$*"; }
warn() { printf '%s⚠ %s%s\n' "$C_YEL" "$*" "$C_OFF" >&2; }
die()  { printf '%s✖ %s%s\n' "$C_RED" "$*" "$C_OFF" >&2; exit 1; }

# Ejecuta docker compose con el archivo y el .env de producción.
# ECOMOVE_ENV_FILE lo usa el compose (env_file de api/migrate) para leer el mismo archivo.
compose() {
  ECOMOVE_ENV_FILE="$ENV_FILE" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# Lee una variable de .env.production SIN ejecutar el archivo (los valores pueden tener espacios).
# Uso: env_get CLAVE [valor_por_defecto]
env_get() {
  local key="$1" default="${2:-}" line value
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  if [ -z "$line" ] || [ -z "$value" ]; then value="$default"; fi
  printf '%s' "$value"
}

require_cmd() {
  local c
  for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "Falta el comando '$c'. Instálalo (ver docs/deployment/VPS_SETUP.md)."; done
}

require_env_file() {
  [ -f "$ENV_FILE" ] || die "No existe $ENV_FILE. Créalo con: infrastructure/scripts/generate_secrets.sh"
  local perms
  perms="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo '?')"
  if [ "$perms" != "600" ] && [ "$perms" != "400" ]; then
    warn "$ENV_FILE tiene permisos $perms; se recomienda: chmod 600 $ENV_FILE"
  fi
}

# Falla si quedan valores de ejemplo en el .env de producción.
check_env_placeholders() {
  local bad
  bad="$(grep -nE '^[A-Z_]+=.*change-me' "$ENV_FILE" | cut -d= -f1 || true)"
  [ -z "$bad" ] || die "Quedan valores 'change-me' en $ENV_FILE: $(echo "$bad" | tr '\n' ' ')"
}

# Confirmación interactiva. ASSUME_YES=1 la omite (solo si sabes lo que haces).
confirm() {
  local prompt="$1" expected="${2:-si}" answer
  if [ "${ASSUME_YES:-0}" = "1" ]; then return 0; fi
  [ -t 0 ] || die "Se necesita confirmación interactiva (o ASSUME_YES=1)."
  read -r -p "$prompt [escribe '$expected' para continuar]: " answer
  [ "$answer" = "$expected" ] || die "Cancelado."
}

# Espera a que una URL local responda 2xx/3xx.
wait_http() {
  local url="$1" tries="${2:-60}" i
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then return 0; fi
    sleep 2
  done
  return 1
}
