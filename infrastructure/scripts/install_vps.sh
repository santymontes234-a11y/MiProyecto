#!/usr/bin/env bash
# Prepara un VPS Ubuntu Server 24.04 LTS (o 22.04) limpio para EcoMove Querétaro.
#
# SE EJECUTA EN EL PROPIO VPS, como root (sudo), DESPUÉS de clonar el repositorio:
#   sudo infrastructure/scripts/install_vps.sh --deploy-user ecomove [--ssh-port 22] [--yes]
#
# Qué hace, en orden (cada paso se anuncia en pantalla):
#   1. Actualiza Ubuntu (apt update + upgrade).
#   2. Instala: curl, git, ufw, fail2ban, nginx, certbot, unattended-upgrades, rsync, jq, openssl.
#   3. Instala Docker Engine + plugin Compose desde el repositorio OFICIAL de Docker.
#   4. Configura Docker: rotación de logs, live-restore, no-new-privileges.
#   5. Crea el usuario de despliegue (sin contraseña, solo clave SSH) y lo añade al grupo docker.
#   6. Crea swap de 2 GB si el VPS no tiene.
#   7. Firewall UFW: deniega entradas salvo SSH (con límite), 80 y 443.
#   8. fail2ban con jails para SSH y Nginx.
#   9. Parámetros de red del kernel (sysctl).
#  10. Actualizaciones de seguridad automáticas.
#  11. Nginx base (sin sitio aún) y hook para recargarlo al renovar certificados.
#  12. Directorio de backups (700) y timer diario de backup (instalado, se activa luego).
#  13. Endurece SSH (sin root, sin contraseñas) SOLO si el usuario ya tiene clave autorizada.
# No toca DNS, no emite certificados y no arranca la aplicación.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DEPLOY_USER="ecomove"
SSH_PORT="22"
SKIP_SSH_HARDENING=0
APP_DIR="$ROOT_DIR"

while [ $# -gt 0 ]; do
  case "$1" in
    --deploy-user) DEPLOY_USER="${2:?}"; shift 2 ;;
    --ssh-port) SSH_PORT="${2:?}"; shift 2 ;;
    --skip-ssh-hardening) SKIP_SSH_HARDENING=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) die "Opción desconocida: $1" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "Ejecuta con sudo."
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "Nombre de usuario no válido: $DEPLOY_USER"
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || die "Puerto SSH no válido: $SSH_PORT"
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "Este script está pensado para Ubuntu Server (detectado: ${ID:-desconocido})."
case "${VERSION_ID:-}" in 22.04|24.04) ;; *) warn "Ubuntu $VERSION_ID no probado; se recomienda 24.04 LTS." ;; esac

SEC="$ROOT_DIR/infrastructure/security"
echo "Se preparará este servidor ($(hostname), Ubuntu $VERSION_ID) para EcoMove Querétaro:"
echo "  usuario de despliegue: $DEPLOY_USER | puerto SSH: $SSH_PORT | app: $APP_DIR"
echo "  puertos abiertos al final: $SSH_PORT/tcp (SSH), 80/tcp (HTTP), 443/tcp (HTTPS)"
confirm "¿Continuar?" "si"

export DEBIAN_FRONTEND=noninteractive

log "1/13 Actualizando Ubuntu"
apt-get update -y
apt-get -o Dpkg::Options::=--force-confold upgrade -y

log "2/13 Instalando paquetes base"
apt-get install -y ca-certificates curl gnupg git ufw fail2ban nginx certbot \
  unattended-upgrades apt-listchanges rsync jq openssl

log "3/13 Instalando Docker Engine (repositorio oficial download.docker.com)"
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  for p in docker.io docker-doc docker-compose podman-docker containerd runc; do
    apt-get remove -y "$p" >/dev/null 2>&1 || true
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  ok "Docker ya instalado: $(docker --version)"
fi

log "4/13 Configurando Docker (/etc/docker/daemon.json)"
if [ -f /etc/docker/daemon.json ] && ! cmp -s /etc/docker/daemon.json "$SEC/docker/daemon.json"; then
  cp -p /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
fi
install -m 644 "$SEC/docker/daemon.json" /etc/docker/daemon.json
systemctl enable docker >/dev/null
systemctl restart docker

log "5/13 Usuario de despliegue '$DEPLOY_USER'"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "EcoMove deploy" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
warn "El grupo 'docker' equivale a root en este servidor: dalo solo a usuarios de confianza."
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"
if [ ! -s "$AUTH_KEYS" ]; then
  src_keys=""
  if [ -n "${SUDO_USER:-}" ] && [ -s "$(getent passwd "$SUDO_USER" | cut -d: -f6)/.ssh/authorized_keys" ]; then
    src_keys="$(getent passwd "$SUDO_USER" | cut -d: -f6)/.ssh/authorized_keys"
  elif [ -s /root/.ssh/authorized_keys ]; then
    src_keys=/root/.ssh/authorized_keys
  fi
  if [ -n "$src_keys" ]; then
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$src_keys" "$AUTH_KEYS"
    ok "Claves SSH copiadas desde $src_keys"
  else
    warn "No hay claves SSH para $DEPLOY_USER. Añádelas a $AUTH_KEYS (VPS_SETUP.md §3)."
  fi
fi
if [ "$(stat -c '%U' "$APP_DIR")" != "$DEPLOY_USER" ]; then
  warn "El repositorio $APP_DIR no pertenece a $DEPLOY_USER. Si lo usará ese usuario: chown -R $DEPLOY_USER: $APP_DIR"
fi

log "6/13 Swap"
if [ "$(swapon --show --noheadings | wc -l)" = "0" ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Swap de 2 GB creado en /swapfile"
else
  ok "Ya existe swap"
fi

log "7/13 Firewall UFW"
ufw default deny incoming
ufw default allow outgoing
ufw limit "${SSH_PORT}/tcp" comment 'SSH (limitado)'
ufw allow 80/tcp comment 'HTTP (redirige a HTTPS y ACME)'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose

log "8/13 fail2ban"
install -m 644 "$SEC/fail2ban/ecomove.local" /etc/fail2ban/jail.d/ecomove.local
if [ "$SSH_PORT" != "22" ]; then
  sed -i "/^\[sshd\]/a port     = ${SSH_PORT}" /etc/fail2ban/jail.d/ecomove.local
fi
# Los logs de Nginx deben existir para que fail2ban arranque las jails de nginx.
touch /var/log/nginx/ecomove-web.access.log /var/log/nginx/ecomove-web.error.log \
      /var/log/nginx/ecomove-api.access.log /var/log/nginx/ecomove-api.error.log
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban

log "9/13 sysctl de red"
install -m 644 "$SEC/sysctl/99-ecomove.conf" /etc/sysctl.d/99-ecomove.conf
sysctl --system >/dev/null

log "10/13 Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
systemctl enable --now unattended-upgrades >/dev/null

log "11/13 Nginx base"
install -d -m 755 /var/www/certbot /etc/nginx/snippets
install -m 644 "$ROOT_DIR/infrastructure/nginx/conf.d/ecomove-http.conf" /etc/nginx/conf.d/ecomove-http.conf
install -m 644 "$ROOT_DIR"/infrastructure/nginx/snippets/ecomove-*.conf /etc/nginx/snippets/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx >/dev/null && systemctl reload nginx
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
# Recarga Nginx tras cada renovación de certificado (lo ejecuta certbot).
nginx -t && systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

log "12/13 Backups"
BACKUP_DIR_CFG="$( [ -f "$ENV_FILE" ] && env_get BACKUP_DIR /var/backups/ecomove || echo /var/backups/ecomove )"
install -d -m 700 -o root -g root "$BACKUP_DIR_CFG"
sed "s#__APP_DIR__#${APP_DIR}#g" "$ROOT_DIR/infrastructure/systemd/ecomove-backup.service" \
  > /etc/systemd/system/ecomove-backup.service
install -m 644 "$ROOT_DIR/infrastructure/systemd/ecomove-backup.timer" /etc/systemd/system/ecomove-backup.timer
systemctl daemon-reload
ok "Timer instalado (inactivo). Actívalo tras el primer despliegue: systemctl enable --now ecomove-backup.timer"

log "13/13 Endurecimiento de SSH"
if [ "$SKIP_SSH_HARDENING" = "1" ]; then
  warn "Omitido por --skip-ssh-hardening."
elif [ ! -s "$AUTH_KEYS" ]; then
  warn "Omitido: $DEPLOY_USER no tiene claves en $AUTH_KEYS (si se aplicara te quedarías fuera)."
else
  sed -e "s/__DEPLOY_USER__/${DEPLOY_USER}/" -e "s/^#Port 22$/Port ${SSH_PORT}/" \
    "$SEC/ssh/99-ecomove-hardening.conf" > /etc/ssh/sshd_config.d/99-ecomove-hardening.conf
  chmod 644 /etc/ssh/sshd_config.d/99-ecomove-hardening.conf
  if sshd -t; then
    if [ "$SSH_PORT" != "22" ] && systemctl is-active --quiet ssh.socket; then
      # Ubuntu 24.04 usa activación por socket: el puerto se aplica al reiniciar ssh.socket.
      systemctl daemon-reload && systemctl restart ssh.socket
    fi
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    ok "SSH endurecido. NO cierres esta sesión: prueba en otra terminal: ssh -p $SSH_PORT $DEPLOY_USER@<IP>"
  else
    rm -f /etc/ssh/sshd_config.d/99-ecomove-hardening.conf
    die "sshd -t falló; se retiró la configuración de endurecimiento."
  fi
fi

ok "VPS preparado. Siguientes pasos: docs/deployment/DEPLOYMENT_GUIDE.md §8 (dominio y DNS)."
