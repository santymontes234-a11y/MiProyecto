#!/usr/bin/env bash
# Backup de EcoMove Querétaro en ESTE servidor.
#
# Uso:
#   infrastructure/scripts/backup.sh                # BD + configuración + archivos persistentes
#   infrastructure/scripts/backup.sh --db-only      # solo la base de datos
#   infrastructure/scripts/backup.sh --tag pre-update
#   infrastructure/scripts/backup.sh --verify <carpeta-de-backup>   # solo verifica uno existente
#
# Resultado: $BACKUP_DIR/<AAAAMMDD-HHMMSS>[-tag]/ (permisos 700) con:
#   db.dump             pg_dump formato custom (comprimido) de $POSTGRES_DB
#   globals.sql.gz      roles de PostgreSQL (incluye hashes de contraseña: ¡sensible!)
#   config.tar.gz       .env.production, Nginx, certificados Let's Encrypt, historial .deploy/
#   files.tar.gz        rutas extra de BACKUP_EXTRA_PATHS (la app hoy no guarda archivos en disco)
#   SHA256SUMS, MANIFEST.txt
# Retención: borra backups con más de BACKUP_RETENTION_DAYS días (por defecto 14).
# Copia externa opcional: BACKUP_RCLONE_REMOTE (p. ej. "b2:ecomove-backups") con rclone.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DB_ONLY=0; TAG=""; VERIFY_ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --db-only) DB_ONLY=1; shift ;;
    --tag) TAG="${2:?}"; shift 2 ;;
    --verify) VERIFY_ONLY="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done

require_cmd docker sha256sum tar gzip
require_env_file

BACKUP_DIR="$(env_get BACKUP_DIR /var/backups/ecomove)"
RETENTION="$(env_get BACKUP_RETENTION_DAYS 14)"
RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
DB_NAME="$(env_get POSTGRES_DB ecomove)"
DB_ADMIN="$(env_get POSTGRES_ADMIN_USER)"
[ -n "$DB_ADMIN" ] || die "POSTGRES_ADMIN_USER vacío en $ENV_FILE"

verify_backup() {
  local dir="$1"
  [ -d "$dir" ] || die "No existe $dir"
  log "Verificando $dir"
  (cd "$dir" && sha256sum --quiet -c SHA256SUMS) || die "Sumas SHA-256 incorrectas en $dir"
  if [ -f "$dir/db.dump" ]; then
    # pg_restore --list lee el índice completo del dump: detecta archivos truncados o corruptos.
    compose exec -T db pg_restore --list < "$dir/db.dump" > /dev/null || die "db.dump no es legible por pg_restore"
    ok "db.dump válido ($(compose exec -T db pg_restore --list < "$dir/db.dump" | grep -c 'TABLE DATA') tablas con datos)"
  fi
  [ ! -f "$dir/globals.sql.gz" ] || gzip -t "$dir/globals.sql.gz" || die "globals.sql.gz dañado"
  [ ! -f "$dir/config.tar.gz" ]  || tar -tzf "$dir/config.tar.gz" > /dev/null || die "config.tar.gz dañado"
  [ ! -f "$dir/files.tar.gz" ]   || tar -tzf "$dir/files.tar.gz" > /dev/null || die "files.tar.gz dañado"
  ok "Backup verificado: $dir"
}

if [ -n "$VERIFY_ONLY" ]; then verify_backup "$VERIFY_ONLY"; exit 0; fi

[ -n "$(compose ps -q db 2>/dev/null)" ] || die "El contenedor db no está en marcha (docker compose ... up -d db)."

# Evita dos backups simultáneos.
exec 9> "${TMPDIR:-/tmp}/ecomove-backup.lock"
flock -n 9 || die "Ya hay un backup en curso."

umask 077
install -d -m 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/${STAMP}${TAG:+-$TAG}"
mkdir -m 700 "$DEST"
trap 'warn "Backup incompleto: se elimina $DEST"; rm -rf "$DEST"' ERR

log "Base de datos '$DB_NAME' → $DEST/db.dump"
compose exec -T db pg_dump -U "$DB_ADMIN" -d "$DB_NAME" --format=custom --compress=6 --no-password > "$DEST/db.dump"
compose exec -T db pg_dumpall -U "$DB_ADMIN" --globals-only --no-password | gzip -9 > "$DEST/globals.sql.gz"

if [ "$DB_ONLY" != "1" ]; then
  log "Configuración → config.tar.gz"
  cfg=()
  for p in "$ENV_FILE" "$DEPLOY_STATE_DIR" /etc/nginx/sites-available/ecomove.conf /etc/nginx/conf.d/ecomove-http.conf \
           /etc/letsencrypt /etc/fail2ban/jail.d/ecomove.local /etc/ssh/sshd_config.d/99-ecomove-hardening.conf; do
    if [ -e "$p" ] && [ -r "$p" ]; then cfg+=("$p"); elif [ -e "$p" ]; then warn "Sin permiso de lectura: $p (ejecuta como root para incluirlo)"; fi
  done
  tar -czPf "$DEST/config.tar.gz" "${cfg[@]}"

  extra="$(env_get BACKUP_EXTRA_PATHS)"
  if [ -n "$extra" ]; then
    log "Archivos persistentes → files.tar.gz ($extra)"
    # shellcheck disable=SC2086
    tar -czPf "$DEST/files.tar.gz" $extra
  fi
fi

{
  echo "EcoMove Querétaro — backup $STAMP${TAG:+ ($TAG)}"
  echo "host: $(hostname)  commit: $(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')"
  echo "deploy: $(cat "$DEPLOY_STATE_DIR/current" 2>/dev/null || echo '?')"
  echo "alembic: $(compose exec -T db psql -U "$DB_ADMIN" -d "$DB_NAME" -tAc 'SELECT version_num FROM alembic_version' 2>/dev/null || echo '?')"
  echo "postgres: $(compose exec -T db psql -U "$DB_ADMIN" -d "$DB_NAME" -tAc 'SHOW server_version' 2>/dev/null || echo '?')"
  ls -l "$DEST"
} > "$DEST/MANIFEST.txt"
(cd "$DEST" && sha256sum -- * | grep -v ' SHA256SUMS$' > SHA256SUMS)
trap - ERR

verify_backup "$DEST"
ok "Backup creado: $DEST ($(du -sh "$DEST" | cut -f1))"

if [ -n "$RETENTION" ] && [ "$RETENTION" -gt 0 ] 2>/dev/null; then
  log "Retención: borrando backups de más de $RETENTION días en $BACKUP_DIR"
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9][01][0-9][0-3][0-9]-*' -mtime "+$RETENTION" -print -exec rm -rf {} +
fi

if [ -n "$RCLONE_REMOTE" ]; then
  require_cmd rclone
  log "Copia externa → $RCLONE_REMOTE/$(basename "$DEST")"
  rclone copy "$DEST" "$RCLONE_REMOTE/$(basename "$DEST")" --immutable
  ok "Copia externa completada"
fi
