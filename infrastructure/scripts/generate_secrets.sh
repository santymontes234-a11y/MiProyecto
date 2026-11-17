#!/usr/bin/env bash
# Genera .env.production a partir de .env.production.example con secretos aleatorios.
#
# Uso:
#   infrastructure/scripts/generate_secrets.sh --domain midominio.mx [--api-domain api.midominio.mx] [--force]
#   infrastructure/scripts/generate_secrets.sh --print     # solo imprime un secreto aleatorio
#
# Qué hace (y nada más):
#   - Copia la plantilla, sustituye example.com por tu dominio y cada "change-me" por un valor
#     aleatorio de 64 caracteres (openssl rand). El archivo queda con permisos 600.
#   - No envía nada a ningún sitio. Los secretos solo existen en este archivo: haz copia segura.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TEMPLATE="$ROOT_DIR/.env.production.example"
DOMAIN_ARG=""; API_DOMAIN_ARG=""; FORCE=0

gen_secret() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "${1:-64}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN_ARG="${2:?}"; shift 2 ;;
    --api-domain) API_DOMAIN_ARG="${2:?}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --output) ENV_FILE="${2:?}"; shift 2 ;;
    --print) require_cmd openssl; gen_secret 64; echo; exit 0 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done

require_cmd openssl sed
[ -f "$TEMPLATE" ] || die "No se encuentra $TEMPLATE"
[ -n "$DOMAIN_ARG" ] || die "Indica tu dominio: --domain midominio.mx (sin https://)"
[[ "$DOMAIN_ARG" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "Dominio no válido: $DOMAIN_ARG"
API_DOMAIN_ARG="${API_DOMAIN_ARG:-api.$DOMAIN_ARG}"

if [ -e "$ENV_FILE" ] && [ "$FORCE" != "1" ]; then
  die "$ENV_FILE ya existe. No se sobrescribe (usa --force; se guardará una copia .bak)."
fi
if [ -e "$ENV_FILE" ]; then
  cp -p "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  warn "Copia del archivo anterior guardada junto a $ENV_FILE (.bak.*). Bórrala cuando no la necesites."
fi

umask 077
tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ ^[A-Z_]+=change-me$ ]]; then
    line="${line%%=*}=$(gen_secret 64)"
  fi
  printf '%s\n' "$line"
done < "$TEMPLATE" > "$tmp"

# Dominios: primero el de la API (más específico), luego el principal.
sed -i "s/api\.example\.com/${API_DOMAIN_ARG}/g; s/example\.com/${DOMAIN_ARG}/g" "$tmp"
sed -i "s/^API_DOMAIN=.*/API_DOMAIN=${API_DOMAIN_ARG}/" "$tmp"

mv "$tmp" "$ENV_FILE"
trap - EXIT
chmod 600 "$ENV_FILE"

ok "Creado $ENV_FILE (permisos 600) con secretos aleatorios para: POSTGRES_PASSWORD, POSTGRES_ADMIN_PASSWORD, JWT_SECRET_KEY, ROUTE_TOKEN_SECRET."
echo "Revisa y completa a mano:"
echo "  - SMTP_* y EMAIL_BACKEND=smtp si quieres enviar correos"
echo "  - GEOCODING_USER_AGENT con un correo de contacto real"
echo "  - BOOTSTRAP_SUPER_ADMIN_EMAIL / BOOTSTRAP_SUPER_ADMIN_PASSWORD para el primer arranque"
echo "  - Ajustes de memoria PG_* según la RAM del VPS"
