#!/usr/bin/env bash
# Muestra logs de EcoMove Querétaro (solo lectura).
#
# Uso:
#   infrastructure/scripts/logs.sh                    # últimas 100 líneas de api, web y db
#   infrastructure/scripts/logs.sh api -f             # seguir la API en vivo
#   infrastructure/scripts/logs.sh web --since 1h
#   infrastructure/scripts/logs.sh nginx [-f]         # logs de acceso/errores de Nginx (requiere sudo)
#   infrastructure/scripts/logs.sh errors             # solo líneas con ERROR/CRITICAL/5xx de la última hora
# Servicios: api | web | db | migrate | osrm-foot | osrm-bicycle | osrm-car | nginx | errors | all
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SERVICE="${1:-all}"; [ $# -gt 0 ] && shift
FOLLOW=0; SINCE=""; TAIL=100
while [ $# -gt 0 ]; do
  case "$1" in
    -f|--follow) FOLLOW=1; shift ;;
    --since) SINCE="${2:?}"; shift 2 ;;
    --tail) TAIL="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done

args=(--tail "$TAIL" --timestamps)
[ "$FOLLOW" = "1" ] && args+=(--follow)
[ -n "$SINCE" ] && args+=(--since "$SINCE")

case "$SERVICE" in
  nginx)
    files=(/var/log/nginx/ecomove-web.access.log /var/log/nginx/ecomove-web.error.log
           /var/log/nginx/ecomove-api.access.log /var/log/nginx/ecomove-api.error.log)
    if [ "$FOLLOW" = "1" ]; then tail -n "$TAIL" -F "${files[@]}"; else tail -n "$TAIL" "${files[@]}"; fi ;;
  errors)
    require_env_file
    compose logs --since "${SINCE:-1h}" --no-color api web db 2>&1 | grep -E 'ERROR|CRITICAL|FATAL|Traceback|" 5[0-9]{2} ' || echo "Sin errores en el periodo." ;;
  all)
    require_env_file
    compose logs "${args[@]}" api web db ;;
  api|web|db|migrate|osrm-foot|osrm-bicycle|osrm-car)
    require_env_file
    compose logs "${args[@]}" "$SERVICE" ;;
  *) die "Servicio desconocido: $SERVICE (ver --help)" ;;
esac
