# Variables de entorno

Producción usa **un único archivo**: `/opt/ecomove/.env.production` (permisos `600`, nunca en Git).
Plantilla: [`.env.production.example`](../../.env.production.example). Generarlo:

```bash
infrastructure/scripts/generate_secrets.sh --domain midominio.mx   # crea .env.production con secretos aleatorios
nano .env.production                                               # completa SMTP, correo de contacto, admin
chmod 600 .env.production
```

`generate_secrets.sh` sustituye cada `change-me` por 64 caracteres aleatorios (`openssl rand`) y
`example.com` por tu dominio. No sobrescribe un archivo existente salvo con `--force` (y guarda una copia `.bak`).
Para un secreto suelto: `infrastructure/scripts/generate_secrets.sh --print`.

**Quién lee qué:** Docker Compose usa el archivo para interpolar `docker-compose.prod.yml` y lo pasa
entero a `api` y `migrate` (`env_file`), **salvo** `POSTGRES_ADMIN_*`, que el compose vacía para esos
contenedores. `web` solo recibe `NODE_ENV` y `API_INTERNAL_BASE_URL`; las `NEXT_PUBLIC_*` se incrustan al
construir la imagen. Tras cambiar el archivo: `infrastructure/scripts/deploy.sh` (o `docker compose ... up -d
--force-recreate api` si solo cambian variables de la API).

## Dominios e imágenes

| Variable | Ejemplo | Uso |
|---|---|---|
| `DOMAIN` | `midominio.mx` | Nginx, certificados, `status.sh` |
| `API_DOMAIN` | `api.midominio.mx` | Nginx |
| `IMAGE_TAG` | `latest` | Etiqueta de imágenes; `deploy.sh` la fija al commit desplegado |
| `API_HOST_PORT` / `WEB_HOST_PORT` | `8000` / `3000` | Puertos en 127.0.0.1 (upstreams de Nginx) |
| `COMPOSE_PROFILES` | (vacío) | `routing` activa OSRM (o usa `deploy.sh --with-routing`) |

## Base de datos

| Variable | Secreto | Uso |
|---|---|---|
| `POSTGRES_DB` | no | Nombre de la BD (`ecomove`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | **sí** | Rol de la **aplicación**, sin superusuario, dueño de la BD. Lo usan api y migrate |
| `POSTGRES_ADMIN_USER` / `POSTGRES_ADMIN_PASSWORD` | **sí** | Superusuario de PostgreSQL. Solo mantenimiento y backups. Nunca llega a la API |
| `PG_SHARED_BUFFERS`, `PG_EFFECTIVE_CACHE_SIZE` | no | Memoria de PostgreSQL (256MB/768MB para 4 GB de RAM) |
| `PG_WORK_MEM`, `PG_MAINTENANCE_WORK_MEM`, `PG_MAX_CONNECTIONS`, `PG_LOG_MIN_DURATION_MS` | no | Ajustes opcionales (8MB, 128MB, 60, 1000) |
| `DB_MEMORY_LIMIT`, `API_MEMORY_LIMIT`, `WEB_MEMORY_LIMIT` | no | Límites de memoria por contenedor (1g, 512m, 512m) |

> Las contraseñas de PostgreSQL se fijan **al crear el volumen**. Cambiarlas después en el `.env` no cambia
> la BD: ver DATABASE_SETUP.md §5.

## API (FastAPI) — `apps/api/app/core/config.py`

| Variable | Producción | Notas |
|---|---|---|
| `API_ENV` | `production` | El compose lo fuerza. Activa validaciones: sin `change-me`, sin CORS `*`, `ROUTE_TOKEN_SECRET` obligatorio |
| `ENABLE_DOCS` | `false` | Swagger en `/api/v1/docs` |
| `LOG_LEVEL` | `INFO` | Logs JSON en stdout (`logs.sh api`) |
| `JWT_SECRET_KEY` | **secreto**, ≥ 32 car. | Firma de tokens. Cambiarlo cierra todas las sesiones |
| `ROUTE_TOKEN_SECRET` | **secreto**, ≥ 32 car. | Firma de `route_token` (/routes) |
| `JWT_ACCESS_TOKEN_EXPIRES_MINUTES` / `JWT_REFRESH_TOKEN_EXPIRES_DAYS` | 15 / 30 | |
| `CORS_ORIGINS` | `https://midominio.mx,https://www.midominio.mx` | Solo orígenes reales. Android no usa CORS |
| `RATE_LIMIT_ENABLED`, `RATE_LIMIT_AUTH_PER_MINUTE`, `RATE_LIMIT_DEFAULT_PER_MINUTE` | `true`, 10, 120 | En memoria del proceso (1 proceso) |
| `LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES` | 5, 15 | Bloqueo de cuenta (en BD) |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | `true` solo con SMTP funcionando |
| `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_HOURS` | 30, 48 | |
| `EMAIL_BACKEND` | `smtp` o `disabled` | `memory` está prohibido en producción |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_STARTTLS`, `SMTP_SSL` | según proveedor | Puerto 587 + STARTTLS o 465 + SSL |
| `EMAIL_FROM` | `EcoMove Querétaro <no-reply@midominio.mx>` | |
| `WEB_URL` | `https://midominio.mx` | Enlaces de los correos |
| `MOBILE_SCHEME` | `ecomove` | Deep links de la app |
| `GEOCODING_ENABLED`, `NOMINATIM_URL`, `GEOCODING_USER_AGENT`, `GEOCODING_PER_MINUTE`, `GEOCODING_CACHE_HOURS`, `GEOCODING_TIMEOUT_S` | `true`, público, con contacto real, 30, 24, 6 | Respeta la política de Nominatim (≤ 1 req/s) |
| `OSRM_FOOT_URL`, `OSRM_BICYCLE_URL`, `OSRM_CAR_URL` | por defecto `http://osrm-*:5000` | Sin OSRM, `/routes` responde 503 y la app usa línea recta |
| `MAX_BODY_BYTES`, `MAX_TRIP_DURATION_HOURS`, `MIN_TRIP_DISTANCE_M`, `SERVICE_AREA_*`, `CITIZEN_REPORTS_PER_DAY`, `NOTIFICATIONS_RETENTION_DAYS`, `MAX_REPORT_ROWS` | valores por defecto | Reglas de negocio; no hace falta tocarlas |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL` / `BOOTSTRAP_SUPER_ADMIN_PASSWORD` | solo el primer arranque | Crea el primer SUPER_ADMIN si no existe ninguno. Contraseña ≥ 12. **Bórrala después** |

Fijadas por el compose (no las pongas en el `.env`): `POSTGRES_HOST=db`, `POSTGRES_PORT=5432`,
`RUN_MIGRATIONS=false` (las ejecuta el job `migrate`), `FORWARDED_ALLOW_IPS=*` (uvicorn confía en
`X-Forwarded-For` de Nginx; es seguro porque la API solo escucha en 127.0.0.1 del host).

## Web (Next.js)

| Variable | Cuándo | Valor |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | **build** | `https://api.midominio.mx/api/v1` (bundle y CSP `connect-src`) |
| `NEXT_PUBLIC_SITE_URL` | **build** | `https://midominio.mx` (canonical, sitemap, Open Graph) |
| `API_INTERNAL_BASE_URL` | runtime | `http://api:8000/api/v1` (lo fija el compose; BFF de sesión) |

Cambiar un dominio exige **reconstruir** la imagen web (`deploy.sh` lo hace siempre).

## Backups

| Variable | Por defecto | Uso |
|---|---|---|
| `BACKUP_DIR` | `/var/backups/ecomove` | Carpeta local (700) |
| `BACKUP_RETENTION_DAYS` | 14 | Borrado de backups antiguos |
| `BACKUP_RCLONE_REMOTE` | (vacío) | p. ej. `b2:ecomove-backups`: copia externa con rclone |
| `BACKUP_EXTRA_PATHS` | (vacío) | Rutas adicionales para `files.tar.gz` (la app hoy no guarda archivos) |

## Android (no van en `.env.production`)

Se configuran en EAS (ANDROID_BUILD.md): `EXPO_PUBLIC_API_BASE_URL` (https obligatorio en producción),
`EXPO_PUBLIC_TILE_URL`, `EXPO_PUBLIC_TILE_URL_DARK`. `APP_VARIANT`/`EXPO_PUBLIC_APP_VARIANT` los fija `eas.json`.

## Desarrollo

El entorno local sigue usando `.env` (plantilla `.env.example`) con `infrastructure/docker-compose.yml`.
`apps/web/.env.example` y `apps/mobile/.env.example` documentan las variables de cada cliente en local.
