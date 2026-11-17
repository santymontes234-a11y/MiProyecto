# Guía de despliegue paso a paso (desde cero)

Esta guía lleva EcoMove Querétaro desde «no tengo servidor» hasta «web, API y app Android en
producción con HTTPS y backups». **Nada se ha desplegado todavía**: los comandos se ejecutan cuando
tengas un VPS y un dominio propios.

Convenciones usadas en toda la guía (sustitúyelas por tus valores reales):

| Marcador | Significado |
|---|---|
| `midominio.mx` | Tu dominio principal (web) |
| `api.midominio.mx` | Subdominio de la API |
| `203.0.113.10` | IP pública del VPS (rango de documentación, no es real) |
| `ecomove` | Usuario de despliegue en el VPS (sin contraseña, solo clave SSH) |
| `/opt/ecomove` | Carpeta del repositorio en el VPS |
| `<URL-DEL-REPOSITORIO>` | URL `git clone` de tu repositorio |

Alias útil en el VPS (añádelo a `~/.bashrc` del usuario `ecomove`):

```bash
alias dc='docker compose -f /opt/ecomove/infrastructure/docker-compose.prod.yml --env-file /opt/ecomove/.env.production'
```

> Los scripts **no ocultan nada**: cada uno empieza con un comentario que lista exactamente lo que
> hace. Léelos antes de ejecutarlos (`less infrastructure/scripts/<script>.sh`).

---

## 1. Características del VPS

Mínimo: 2 vCPU, 4 GB RAM, 40 GB SSD, IPv4 pública. Recomendado: 4 vCPU, 8 GB RAM, 80 GB SSD (necesario
si activas el ruteo OSRM). Detalle y justificación en [VPS_REQUIREMENTS.md](VPS_REQUIREMENTS.md).

Al contratarlo elige **acceso por clave SSH** (sube tu clave pública en el panel del proveedor).

## 2. Sistema operativo

**Ubuntu Server 24.04 LTS** (64 bits). 22.04 funciona, pero su Nginx 1.18 no soporta
`ssl_reject_handshake` (ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

Si aún no tienes clave SSH en tu equipo:

```bash
ssh-keygen -t ed25519 -C "admin-ecomove"
cat ~/.ssh/id_ed25519.pub      # pégala en el panel del proveedor
```

## 3. Conectarse por SSH

```bash
ssh root@203.0.113.10          # o ssh ubuntu@203.0.113.10, según el proveedor
```

La primera vez SSH muestra la huella del servidor: compárala con la que muestra el panel del
proveedor antes de aceptar.

## 4. Actualizar Ubuntu y descargar el repositorio

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git
sudo reboot                      # si se actualizó el kernel; vuelve a conectar después
```

El script de preparación vive en el repositorio, así que lo clonamos ya (el paso 10 lo deja listo
para el usuario de despliegue):

```bash
sudo git clone <URL-DEL-REPOSITORIO> /opt/ecomove
cd /opt/ecomove
```

Si el repositorio es privado, usa una *deploy key* de solo lectura (GitHub → Settings → Deploy keys)
en lugar de tu usuario personal.

## 5. Instalar Docker (y el resto de la base del servidor)

`install_vps.sh` hace los pasos 5, 6 y 7 de esta guía y algunos más (lista completa en su cabecera):

```bash
less infrastructure/scripts/install_vps.sh                 # léelo primero
sudo infrastructure/scripts/install_vps.sh --deploy-user ecomove
```

Docker se instala desde el **repositorio oficial de Docker** (no el paquete `docker.io` de Ubuntu).
Equivalente manual, si prefieres hacerlo a mano:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo cp infrastructure/security/docker/daemon.json /etc/docker/daemon.json && sudo systemctl restart docker
```

Comprueba:

```bash
docker --version && docker compose version
```

> Estar en el grupo `docker` equivale a ser root. Solo el usuario de despliegue debe estar en él.

## 6. Firewall

Lo configura `install_vps.sh`. A mano:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit 22/tcp            # o tu puerto SSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Docker publica puertos saltándose UFW; por eso `docker-compose.prod.yml` solo publica en
`127.0.0.1` y la base de datos no publica ninguno. **No cambies esos `127.0.0.1`.**

## 7. Asegurar SSH

`install_vps.sh` copia tu clave autorizada al usuario `ecomove` y **solo** endurece SSH si esa clave
existe (para no dejarte fuera). Antes de cerrar la sesión de root, abre **otra terminal** y prueba:

```bash
ssh ecomove@203.0.113.10
```

Si funciona, el endurecimiento queda activo (`/etc/ssh/sshd_config.d/99-ecomove-hardening.conf`):
sin login de root, sin contraseñas, máximo 3 intentos. Si lo omitiste (`--skip-ssh-hardening`),
aplícalo a mano:

```bash
sudo sed 's/__DEPLOY_USER__/ecomove/' infrastructure/security/ssh/99-ecomove-hardening.conf | sudo tee /etc/ssh/sshd_config.d/99-ecomove-hardening.conf
sudo sshd -t && sudo systemctl restart ssh
```

Más medidas en [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

## 8. Dominio

Compra un dominio en cualquier registrador (p. ej. `midominio.mx`). Usarás:

- `midominio.mx` → web
- `www.midominio.mx` → redirige a `midominio.mx`
- `api.midominio.mx` → API (la usa también la app Android)

## 9. DNS

En el panel DNS del registrador crea:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `@` | `203.0.113.10` | 300 |
| A | `www` | `203.0.113.10` | 300 |
| A | `api` | `203.0.113.10` | 300 |

(+ `AAAA` si tu VPS tiene IPv6 y lo abres en UFW.) Comprueba la propagación desde tu equipo:

```bash
dig +short midominio.mx www.midominio.mx api.midominio.mx
```

Los tres deben devolver la IP del VPS antes de pedir el certificado. Detalle (CAA, correo) en
[DOMAIN_AND_DNS.md](DOMAIN_AND_DNS.md).

## 10. Clonar el proyecto (dejarlo para el usuario de despliegue)

Ya lo clonaste en el paso 4; ahora lo pasa a ser del usuario `ecomove`, que es quien despliega:

```bash
sudo chown -R ecomove:ecomove /opt/ecomove
exit                                   # sal de root
ssh ecomove@203.0.113.10
cd /opt/ecomove
git status && git log -1 --oneline     # confirma rama y commit
```

## 11. Archivo `.env.production`

Se crea a partir de `.env.production.example` (en Git) y **nunca** se sube a Git
(`.gitignore` lo excluye). Ver todas las variables en [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).

## 12. Secretos

```bash
infrastructure/scripts/generate_secrets.sh --domain midominio.mx --api-domain api.midominio.mx
ls -l .env.production                  # -rw------- (600)
```

Esto sustituye cada `change-me` por 64 caracteres aleatorios y `example.com` por tu dominio. Después
edita a mano lo que no se puede generar:

```bash
nano .env.production
```

- `EMAIL_BACKEND=smtp` + `SMTP_*` si quieres verificación de correo y recuperación de contraseña.
- `BOOTSTRAP_SUPER_ADMIN_EMAIL` y `BOOTSTRAP_SUPER_ADMIN_PASSWORD` (paso 19). El correo debe tener un
  dominio real: `.test`/`.local` se rechazan.
- `PG_SHARED_BUFFERS` / `PG_EFFECTIVE_CACHE_SIZE` según la RAM.

Guarda una copia de `.env.production` en un gestor de contraseñas: sin ella no podrás descifrar las
sesiones ni restaurar la configuración.

## 13. Levantar Docker Compose

```bash
infrastructure/scripts/deploy.sh
```

Lo que hace (también lo imprime en pantalla): comprueba `.env.production`, construye
`ecomove/api:<commit>` y `ecomove/web:<commit>`, arranca la BD, ejecuta migraciones, arranca `api` y
`web`, espera a que estén *healthy* y verifica `127.0.0.1`. La primera vez tarda (compila la web).

Equivalente manual:

```bash
export IMAGE_TAG=$(git rev-parse --short=12 HEAD)
dc build api web
dc up -d --wait db
dc run --rm migrate
dc up -d --wait api web
dc ps
```

Ruteo OSRM opcional (descarga ~700 MB y necesita ~2 GB de RAM extra): `deploy.sh --with-routing`.

## 14. Migraciones

`deploy.sh` las ejecuta siempre en el contenedor efímero `migrate` (`alembic upgrade head`) **antes**
de arrancar la API nueva. Comprobar o ejecutar a mano:

```bash
dc run --rm migrate current      # revisión aplicada
dc run --rm migrate history
dc run --rm migrate upgrade head
```

Las migraciones corren con el rol de la aplicación (sin superusuario). Ver
[DATABASE_SETUP.md](DATABASE_SETUP.md), también para importar datos de OpenStreetMap.

## 15. Nginx

Nginx corre en el host (lo instaló el paso 5). Primero, configuración solo HTTP para poder emitir el
certificado:

```bash
sudo infrastructure/scripts/configure_nginx.sh --bootstrap
curl -I http://midominio.mx/      # 503 "configurando HTTPS": correcto en esta fase
```

El script valida con `nginx -t` antes de recargar y restaura la versión anterior si falla.

## 16. HTTPS

Emite **un** certificado para los tres nombres (Let's Encrypt, webroot):

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d midominio.mx -d www.midominio.mx -d api.midominio.mx \
  --cert-name midominio.mx --email tu-correo@midominio.mx --agree-tos --no-eff-email
sudo infrastructure/scripts/configure_nginx.sh --full
sudo certbot renew --dry-run      # la renovación automática funciona
```

`--full` activa HTTPS, redirección HTTP→HTTPS, HSTS, cabeceras de seguridad y límites de peticiones.
Detalle en [HTTPS_SETUP.md](HTTPS_SETUP.md).

## 17. Verificar el sitio

```bash
curl -I https://midominio.mx/            # 200 + strict-transport-security
curl -I http://midominio.mx/             # 301 → https
curl -I https://www.midominio.mx/        # 301 → https://midominio.mx/
```

Abre `https://midominio.mx` en el navegador: candado válido, mapa visible, sin errores en consola.
Opcional: <https://www.ssllabs.com/ssltest/> con tu dominio.

## 18. Verificar la API

```bash
curl -s https://api.midominio.mx/api/v1/health    # {"status":"ok",...,"database":"ok"}
curl -I https://api.midominio.mx/docs             # 404 (ENABLE_DOCS=false en producción)
curl -I https://api.midominio.mx/                 # 404
```

## 19. Crear el primer administrador

1. En `.env.production` define `BOOTSTRAP_SUPER_ADMIN_EMAIL` (dominio real) y
   `BOOTSTRAP_SUPER_ADMIN_PASSWORD` (≥ 12 caracteres; puedes generarla con
   `infrastructure/scripts/generate_secrets.sh --print`).
2. Reinicia la API para que lo cree (solo si no existe ningún SUPER_ADMIN):

   ```bash
   dc up -d --force-recreate --no-deps api
   dc logs api | grep -i admin
   ```

3. Inicia sesión en `https://midominio.mx` con esa cuenta y comprueba que ves el panel de administración.
4. **Borra** `BOOTSTRAP_SUPER_ADMIN_PASSWORD` de `.env.production` y vuelve a ejecutar el comando del
   punto 2.
5. Crea un segundo administrador (cuenta de respaldo) desde el panel.

## 20. Backups

```bash
sudo infrastructure/scripts/backup.sh                   # primer backup manual
sudo ls -l /var/backups/ecomove/
sudo systemctl enable --now ecomove-backup.timer         # diario a las 03:15
systemctl list-timers ecomove-backup.timer
```

Cada backup contiene BD (`pg_dump`), roles, configuración (`.env.production`, Nginx, certificados) y
sumas SHA-256, y se verifica al crearse. Se borran los de más de 14 días. **Copia fuera del VPS:**
configura `BACKUP_RCLONE_REMOTE` (ver [BACKUPS_AND_RESTORE.md](BACKUPS_AND_RESTORE.md)); un backup que
solo vive en el mismo servidor no protege de perder el servidor.

## 21. Actualizar la aplicación

```bash
cd /opt/ecomove
infrastructure/scripts/deploy.sh --pull
```

Hace backup previo de la BD, `git pull --ff-only`, construye, migra y reemplaza los contenedores.
Volver atrás si algo falla:

```bash
infrastructure/scripts/deploy.sh --rollback
```

Ver [UPDATE_APPLICATION.md](UPDATE_APPLICATION.md) y [ROLLBACK.md](ROLLBACK.md) (el rollback de
imágenes no deshace migraciones).

## 22. Restaurar un backup

```bash
sudo ls /var/backups/ecomove/
sudo infrastructure/scripts/restore.sh /var/backups/ecomove/<AAAAMMDD-HHMMSS>
```

Pide escribir `RESTAURAR`, hace antes un backup de seguridad del estado actual, recrea la BD,
restaura, migra y vuelve a arrancar la API. Con `--config` extrae además la configuración a una
carpeta de revisión (no sobrescribe `/etc`). Practícalo al menos una vez antes de abrir al público.

## 23. Errores comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `certbot` falla con *unauthorized* | DNS aún no apunta al VPS, o falta `--bootstrap` | `dig +short midominio.mx`; repetir paso 15 |
| `deploy.sh`: «contiene change-me» | No generaste secretos | Paso 12 |
| 502 Bad Gateway | Contenedor caído o arrancando | `infrastructure/scripts/status.sh`, `infrastructure/scripts/logs.sh api` |
| La web compila y se queda sin memoria | VPS con poca RAM | Swap (lo crea `install_vps.sh`) o construir en CI (ver UPDATE_APPLICATION.md) |
| `migrate` falla | Migración incompatible con los datos | `infrastructure/scripts/logs.sh migrate`; restaurar backup previo |
| 429 en el login para todos | La IP del cliente no llega a la API (riesgo R1) | Ver [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) |
| Te quedaste fuera por SSH | Endurecimiento sin clave válida | Consola web del proveedor; revisar `99-ecomove-hardening.conf` |
| La app Android no conecta | URL `http://` o dominio sin certificado | [ANDROID_BUILD.md](ANDROID_BUILD.md) |

Lista completa: [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Antes de anunciar el sitio, recorre
[PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).
