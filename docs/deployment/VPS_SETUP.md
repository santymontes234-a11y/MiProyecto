# Preparación del VPS (Ubuntu 24.04)

Todo esto lo automatiza `infrastructure/scripts/install_vps.sh`, que **se ejecuta dentro del VPS** y
anuncia cada paso. Esta página explica qué hace para que puedas hacerlo a mano o revisarlo.

## 1. Primer acceso

Tu proveedor te da una IP y acceso como `root` (idealmente con tu clave SSH pública cargada al crear el VPS).

```bash
# En TU computadora: crea una clave si no tienes (Ed25519)
ssh-keygen -t ed25519 -C "ecomove-vps"
# Conéctate (sustituye la IP)
ssh root@203.0.113.10
```

## 2. Actualizar Ubuntu

```bash
apt update && apt upgrade -y
reboot   # si se actualizó el kernel
```

## 3. Usuario de despliegue

No trabajes como root. El script crea el usuario `ecomove`, sin contraseña (solo clave SSH),
y copia las claves autorizadas de root:

```bash
adduser --disabled-password --gecos "" ecomove
install -d -m 700 -o ecomove -g ecomove /home/ecomove/.ssh
install -m 600 -o ecomove -g ecomove /root/.ssh/authorized_keys /home/ecomove/.ssh/authorized_keys
```

Para que `ecomove` pueda usar `sudo`, dale una contraseña (`passwd ecomove`) y `usermod -aG sudo ecomove`,
o sigue usando root solo para las tareas de sistema.

## 4. Clonar el repositorio

```bash
apt install -y git
install -d -o ecomove -g ecomove /opt/ecomove
sudo -u ecomove git clone <URL-de-tu-repositorio> /opt/ecomove
```

Repositorio privado: crea una *deploy key* de solo lectura en GitHub (Settings → Deploy keys) con una
clave generada en el VPS por el usuario `ecomove` (`ssh-keygen -t ed25519`), y clona por SSH.

## 5. Ejecutar el instalador

```bash
cd /opt/ecomove
sudo infrastructure/scripts/install_vps.sh --deploy-user ecomove --ssh-port 22
```

Qué instala y configura (en orden):

| Paso | Qué | Dónde |
|---|---|---|
| 1 | `apt update && upgrade` | sistema |
| 2 | curl, git, ufw, fail2ban, nginx, certbot, unattended-upgrades, rsync, jq, openssl | apt |
| 3 | Docker Engine + Compose desde `download.docker.com` (firmado con su clave GPG) | `/etc/apt/sources.list.d/docker.list` |
| 4 | Logs rotados (10 MB × 5), `live-restore`, `no-new-privileges` | `/etc/docker/daemon.json` |
| 5 | Usuario `ecomove` en el grupo `docker` | `/home/ecomove` |
| 6 | Swap de 2 GB si no hay | `/swapfile` |
| 7 | UFW: deniega todo salvo SSH (limitado), 80, 443 | `ufw status` |
| 8 | fail2ban: sshd, nginx-limit-req, nginx-botsearch (bloqueo vía UFW) | `/etc/fail2ban/jail.d/ecomove.local` |
| 9 | sysctl de red (anti-spoofing, sin redirects) | `/etc/sysctl.d/99-ecomove.conf` |
| 10 | Actualizaciones de seguridad automáticas | `/etc/apt/apt.conf.d/20auto-upgrades` |
| 11 | Nginx base (ajustes globales y snippets, sin sitio) + hook de recarga al renovar | `/etc/nginx/conf.d`, `/etc/nginx/snippets` |
| 12 | Carpeta de backups (700) y timer diario (inactivo) | `/var/backups/ecomove`, `/etc/systemd/system/ecomove-backup.*` |
| 13 | SSH sin root ni contraseñas, solo `ecomove` (si tiene clave) | `/etc/ssh/sshd_config.d/99-ecomove-hardening.conf` |

> **Importante — grupo docker:** pertenecer al grupo `docker` equivale a ser root. Solo el usuario de
> despliegue debe estar en él.

> **Importante — SSH:** tras el paso 13, **no cierres la sesión**. Abre otra terminal y comprueba
> `ssh ecomove@IP`. Si falla, en la sesión abierta: `rm /etc/ssh/sshd_config.d/99-ecomove-hardening.conf && systemctl reload ssh`.

## 6. Firewall a mano (equivalente)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

**Docker y UFW:** Docker inserta sus propias reglas de iptables y **puede saltarse UFW** para los puertos
publicados. Por eso en producción la API y la web publican solo en `127.0.0.1` y la base de datos no
publica ningún puerto. Compruébalo con `sudo ss -tlnp` (no debe haber `0.0.0.0:8000`, `:3000` ni `:5432`).

## 7. Cambiar el puerto SSH (opcional)

1. `sudo ufw limit 2222/tcp`
2. `sudo infrastructure/scripts/install_vps.sh --deploy-user ecomove --ssh-port 2222` (o edita el drop-in).
3. En Ubuntu 24.04 SSH usa activación por socket: `sudo systemctl daemon-reload && sudo systemctl restart ssh.socket`.
4. Prueba `ssh -p 2222 ecomove@IP` en otra terminal y, si funciona, `sudo ufw delete limit 22/tcp`.
