# Seguridad y endurecimiento

Complementa [`docs/SECURITY.md`](../SECURITY.md) (seguridad de la aplicación) con la del servidor.

## Superficie expuesta

| Puerto | Servicio | Acceso |
|---|---|---|
| 22/tcp (o el elegido) | OpenSSH | Internet, solo clave, `ufw limit`, fail2ban |
| 80/tcp | Nginx | Redirección a HTTPS y desafío ACME |
| 443/tcp | Nginx | Web y API |
| 127.0.0.1:3000 / 127.0.0.1:8000 | web / api | Solo desde el propio VPS (Nginx) |
| 5432 | PostgreSQL | **No publicado**. Red Docker interna sin salida |

Compruébalo: `sudo ss -tlnp` y `sudo ufw status verbose`.

## Medidas incluidas

**Sistema** (install_vps.sh): actualizaciones de seguridad automáticas; UFW con denegación por defecto;
fail2ban (sshd, nginx-limit-req, nginx-botsearch, baneo progresivo hasta 1 semana); sysctl anti-spoofing y
sin redirects ICMP; swap; logs de Docker rotados.

**SSH** (`infrastructure/security/ssh/99-ecomove-hardening.conf`): sin root, sin contraseñas, solo clave
pública, `AllowUsers ecomove`, `MaxAuthTries 3`, sin X11 ni agent forwarding, desconexión de sesiones
inactivas. Solo se aplica si el usuario ya tiene clave (para no dejarte fuera) y tras `sshd -t`.

**Docker**: usuario no root (uid 10001) en api y web; sistema de archivos de solo lectura (`read_only`)
con `/tmp` en memoria; `cap_drop: ALL`; `no-new-privileges`; límites de memoria; red `backend` interna;
imágenes multi-etapa sin compiladores ni herramientas de desarrollo; `.dockerignore` en lista blanca
(nunca entra un `.env` en una imagen).

**PostgreSQL**: rol de aplicación sin superusuario; superusuario solo para mantenimiento; SCRAM-SHA-256;
sin puerto publicado.

**Nginx**: TLS 1.2/1.3, HSTS, `server_tokens off`, rechazo de Host desconocido, límites por IP, tamaño
de cuerpo 1 MB, timeouts, bloqueo de archivos ocultos, logs separados para fail2ban.

**Aplicación** (ya existente): CSP y cabeceras de seguridad en web y API, CORS en lista blanca, rate limit y
bloqueo por intentos fallidos, Swagger desactivado en producción, validación de secretos al arrancar
(`API_ENV=production` rechaza `change-me`).

## Permisos

| Ruta | Dueño | Modo | Motivo |
|---|---|---|---|
| `/opt/ecomove` | `ecomove` | 755 | Código (sin secretos salvo el `.env`) |
| `/opt/ecomove/.env.production` | `ecomove` | **600** | Secretos |
| `/var/backups/ecomove` | root | **700** | Backups con secretos |
| `/etc/letsencrypt/live/...` | root | 700/600 | Claves privadas TLS |
| `/home/ecomove/.ssh` | `ecomove` | 700 (`authorized_keys` 600) | |
| `/etc/ssh/sshd_config.d/99-ecomove-hardening.conf` | root | 644 | |

El grupo `docker` equivale a root: solo `ecomove`. No des `sudo` sin contraseña.

## Secretos

- Nunca en Git: `.gitignore` excluye `.env*` salvo las plantillas `*.example`; CI comprueba que no haya `.env` versionados.
- Generación: `generate_secrets.sh` (64 caracteres aleatorios).
- Guarda una copia de `.env.production` en un gestor de contraseñas (Bitwarden, 1Password…).
- **Rotación**: `JWT_SECRET_KEY` (cierra todas las sesiones), `ROUTE_TOKEN_SECRET`, contraseñas de BD
  (DATABASE_SETUP.md §5), contraseña SMTP. Rota de inmediato si sospechas una filtración.
- Borra `BOOTSTRAP_SUPER_ADMIN_PASSWORD` del `.env` tras crear el primer administrador.

## Checklist de hardening

- [ ] Ubuntu 24.04 actualizado; `unattended-upgrades` activo (`systemctl status unattended-upgrades`)
- [ ] Acceso SSH solo con clave; `ssh root@IP` rechazado; contraseñas rechazadas
- [ ] `ufw status`: solo SSH, 80, 443
- [ ] `sudo ss -tlnp`: 3000/8000 solo en 127.0.0.1; 5432 no aparece
- [ ] `sudo fail2ban-client status` muestra sshd, nginx-limit-req y nginx-botsearch
- [ ] `.env.production` con permisos 600 y sin `change-me`; copia en gestor de contraseñas
- [ ] `ENABLE_DOCS=false`; `https://api.midominio.mx/api/v1/docs` → 404
- [ ] `CORS_ORIGINS` solo con los dominios reales
- [ ] `BOOTSTRAP_SUPER_ADMIN_PASSWORD` vacío tras el primer arranque; 2.º administrador creado
- [ ] Certificado válido y `certbot renew --dry-run` correcto
- [ ] SSL Labs ≥ A
- [ ] Backups diarios activos y copia externa configurada; restauración probada
- [ ] Snapshots del proveedor activados
- [ ] Monitor externo de disponibilidad (UptimeRobot, Better Stack…) sobre `/` y `/api/v1/health`
- [ ] Autenticación en dos pasos en el proveedor del VPS, registrador, GitHub y Expo

## Riesgos conocidos

Ver PRODUCTION_CHECKLIST.md, sección «Riesgos pendientes».
