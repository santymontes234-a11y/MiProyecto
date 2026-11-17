#!/usr/bin/env bash
# Genera e instala la configuración de Nginx del HOST a partir de las plantillas del repositorio.
#
# Uso (en el VPS, con sudo):
#   sudo infrastructure/scripts/configure_nginx.sh --bootstrap   # 1) solo HTTP, para emitir el certificado
#   sudo infrastructure/scripts/configure_nginx.sh --full        # 2) HTTPS completo (requiere certificado)
#   infrastructure/scripts/configure_nginx.sh --full --output /tmp/nginx-render   # solo generar (sin instalar)
#
# Qué toca en el sistema (modo instalación):
#   /etc/nginx/conf.d/ecomove-http.conf, /etc/nginx/snippets/ecomove-*.conf,
#   /etc/nginx/sites-available/ecomove.conf (+ enlace en sites-enabled), /var/www/certbot.
#   Valida con "nginx -t" ANTES de recargar; si falla, restaura la versión anterior.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MODE=""; OUTPUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bootstrap) MODE="bootstrap"; shift ;;
    --full) MODE="full"; shift ;;
    --output) OUTPUT="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done
[ -n "$MODE" ] || die "Indica --bootstrap o --full"
require_env_file

DOMAIN="$(env_get DOMAIN)"
API_DOMAIN="$(env_get API_DOMAIN "api.$DOMAIN")"
WEB_PORT="$(env_get WEB_HOST_PORT 3000)"
API_PORT="$(env_get API_HOST_PORT 8000)"
[ -n "$DOMAIN" ] || die "DOMAIN vacío en $ENV_FILE"
if [ "$DOMAIN" = "example.com" ] && [ -z "$OUTPUT" ]; then
  die "DOMAIN sigue siendo example.com: pon tu dominio real en $ENV_FILE"
fi

NGINX_SRC="$ROOT_DIR/infrastructure/nginx"
if [ "$MODE" = "bootstrap" ]; then
  TEMPLATE="$NGINX_SRC/sites/ecomove-bootstrap.conf.template"
else
  TEMPLATE="$NGINX_SRC/sites/ecomove.conf.template"
fi

render() {
  sed -e "s/__API_DOMAIN__/${API_DOMAIN}/g" \
      -e "s/__DOMAIN__/${DOMAIN}/g" \
      -e "s/__WEB_PORT__/${WEB_PORT}/g" \
      -e "s/__API_PORT__/${API_PORT}/g" "$TEMPLATE"
}

if [ -n "$OUTPUT" ]; then
  mkdir -p "$OUTPUT/conf.d" "$OUTPUT/snippets" "$OUTPUT/sites-available"
  cp "$NGINX_SRC"/conf.d/*.conf "$OUTPUT/conf.d/"
  cp "$NGINX_SRC"/snippets/*.conf "$OUTPUT/snippets/"
  render > "$OUTPUT/sites-available/ecomove.conf"
  ok "Configuración ($MODE) generada en $OUTPUT (no se instaló nada)."
  exit 0
fi

[ "$(id -u)" = "0" ] || die "Ejecuta con sudo para instalar en /etc/nginx."
require_cmd nginx
if [ "$MODE" = "full" ] && [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  die "No hay certificado en /etc/letsencrypt/live/$DOMAIN/. Emítelo primero (docs/deployment/HTTPS_SETUP.md)."
fi

backup_dir="$(mktemp -d /tmp/ecomove-nginx-prev.XXXXXX)"
for f in /etc/nginx/conf.d/ecomove-http.conf /etc/nginx/sites-available/ecomove.conf /etc/nginx/snippets/ecomove-*.conf; do
  [ -e "$f" ] && cp -p "$f" "$backup_dir/" || true
done

log "Instalando configuración Nginx ($MODE) para $DOMAIN y $API_DOMAIN"
install -d -m 755 /var/www/certbot /etc/nginx/snippets
install -m 644 "$NGINX_SRC"/conf.d/ecomove-http.conf /etc/nginx/conf.d/ecomove-http.conf
install -m 644 "$NGINX_SRC"/snippets/ecomove-*.conf /etc/nginx/snippets/
render > /etc/nginx/sites-available/ecomove.conf
chmod 644 /etc/nginx/sites-available/ecomove.conf
ln -sfn /etc/nginx/sites-available/ecomove.conf /etc/nginx/sites-enabled/ecomove.conf
rm -f /etc/nginx/sites-enabled/default

if nginx -t; then
  systemctl reload nginx
  ok "Nginx recargado. Copia de la configuración anterior: $backup_dir"
else
  warn "nginx -t falló: restaurando la configuración anterior."
  if [ ! -e "$backup_dir/ecomove.conf" ]; then
    rm -f /etc/nginx/sites-enabled/ecomove.conf /etc/nginx/sites-available/ecomove.conf
  fi
  for f in "$backup_dir"/*; do
    [ -e "$f" ] || continue
    case "$(basename "$f")" in
      ecomove-http.conf) cp -p "$f" /etc/nginx/conf.d/ ;;
      ecomove.conf) cp -p "$f" /etc/nginx/sites-available/ ;;
      *) cp -p "$f" /etc/nginx/snippets/ ;;
    esac
  done
  die "Configuración no aplicada. Revisa el error de nginx -t."
fi
