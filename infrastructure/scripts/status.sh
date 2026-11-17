#!/usr/bin/env bash
# Estado de EcoMove Querétaro en este servidor (solo lectura: no cambia nada).
# Uso: infrastructure/scripts/status.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cmd docker curl
require_env_file

DOMAIN="$(env_get DOMAIN)"
API_PORT="$(env_get API_HOST_PORT 8000)"
WEB_PORT="$(env_get WEB_HOST_PORT 3000)"
BACKUP_DIR="$(env_get BACKUP_DIR /var/backups/ecomove)"

section() { printf '\n%s== %s ==%s\n' "$C_BLU" "$1" "$C_OFF"; }

section "Versión desplegada"
echo "tag: $(cat "$DEPLOY_STATE_DIR/current" 2>/dev/null || echo 'sin registrar')   repo: $(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')"

section "Contenedores"
compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}' || true

section "Salud"
if body="$(curl -fsS --max-time 5 "http://127.0.0.1:${API_PORT}/api/v1/health" 2>/dev/null)"; then ok "API  $body"; else warn "API no responde en 127.0.0.1:${API_PORT}"; fi
code="$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/" || true)"
if [ "${code:0:1}" = "2" ] || [ "${code:0:1}" = "3" ]; then ok "Web  HTTP $code"; else warn "Web  HTTP ${code:-sin respuesta}"; fi
if command -v nginx >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then ok "Nginx activo"; else warn "Nginx inactivo"; fi
fi

section "Certificado TLS"
cert="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [ -r "$cert" ]; then
  end="$(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2)"
  days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  if [ "$days" -gt 14 ]; then ok "$DOMAIN caduca en $days días ($end)"; else warn "$DOMAIN caduca en $days días: revisa certbot renew"; fi
else
  echo "No se puede leer $cert (¿sin emitir o sin sudo?)"
fi

section "Último backup"
if [ -r "$BACKUP_DIR" ]; then
  last="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
  if [ -n "$last" ]; then
    age_h=$(( ( $(date +%s) - $(stat -c %Y "$last") ) / 3600 ))
    if [ "$age_h" -le 26 ]; then ok "$last (hace ${age_h} h)"; else warn "$last (hace ${age_h} h: ¿falla el timer?)"; fi
  else
    warn "No hay backups en $BACKUP_DIR"
  fi
else
  echo "Sin permiso para leer $BACKUP_DIR (usa sudo)"
fi

section "Recursos"
df -h / | tail -1 | awk '{print "Disco /: " $3 " usados de " $2 " (" $5 ")"}'
free -h | awk '/Mem:/ {print "RAM: " $3 " usados de " $2}'
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null || true
docker system df 2>/dev/null || true

if [ "$(id -u)" = "0" ]; then
  section "Firewall y fail2ban"
  ufw status 2>/dev/null | head -12 || true
  fail2ban-client status 2>/dev/null || true
fi
