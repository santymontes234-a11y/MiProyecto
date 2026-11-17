# Infraestructura

| Servicio | Imagen | Puerto (solo localhost) |
|---|---|---|
| `db` | `postgis/postgis:16-3.4` | 5432 (`POSTGRES_HOST_PORT` para cambiarlo) |
| `api` | build de `apps/api/Dockerfile` (ejecuta `alembic upgrade head` y arranca uvicorn) | 8000 |

```bash
cp .env.example .env              # y cambia todos los "change-me"
npm run infra:up                  # docker compose ... up -d --build
npm run infra:down
```

Solo la base de datos (para desarrollar la API con el venv local):

```bash
docker compose -f infrastructure/docker-compose.yml --env-file .env up -d db
```

Web y mobile se ejecutan fuera de Docker en desarrollo (`npm run dev:web`, `npm run dev:mobile`).

## Ruteo (`/routes`, opcional)

Perfil `routing`: descarga México de Geofabrik (~700 MB, solo la primera vez), recorta Querétaro con
osmium y prepara OSRM (foot, bicycle, car) en el volumen `osrm_data` (~1 GB de disco, ~2 GB de RAM).
Datos © OpenStreetMap contributors (ODbL).

```bash
docker compose -f infrastructure/docker-compose.yml --env-file .env --profile routing up -d
```

Sin este perfil, `/routes` responde `503 ROUTING_UNAVAILABLE` y la app móvil usa línea recta.

## Producción (VPS)

Archivos de producción, **preparados pero no desplegados** en ningún servidor:

| Ruta | Contenido |
|---|---|
| `docker-compose.prod.yml` | `db` (red interna, sin puertos), `migrate` (job), `api` y `web` en `127.0.0.1`, OSRM opcional (`--profile routing`) |
| `postgres/init-prod/` | Rol de la aplicación sin superusuario |
| `nginx/` | Plantillas de Nginx del host: HTTPS, redirecciones, cabeceras, límites de peticiones |
| `security/` | SSH, fail2ban, sysctl, `daemon.json` de Docker |
| `systemd/` | Timer de backup diario |
| `scripts/` | `install_vps.sh`, `generate_secrets.sh`, `configure_nginx.sh`, `deploy.sh`, `backup.sh`, `restore.sh`, `status.sh`, `logs.sh` |

Variables: `.env.production.example` (raíz) → `.env.production` (nunca en Git) con
`scripts/generate_secrets.sh --domain midominio.mx`.

```bash
infrastructure/scripts/deploy.sh            # en el VPS: build, migraciones, arranque y verificación
infrastructure/scripts/status.sh
```

Guía completa paso a paso: [`docs/deployment/DEPLOYMENT_GUIDE.md`](../docs/deployment/DEPLOYMENT_GUIDE.md).
