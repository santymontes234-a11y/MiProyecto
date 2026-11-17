# Despliegue de EcoMove Querétaro

Documentación para llevar EcoMove Querétaro a un VPS propio. **Nada de esto se ha desplegado todavía:**
el repositorio contiene los archivos, scripts y guías para que el propietario lo haga.

Empieza por **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** (guía paso a paso desde cero).

| Documento | Para qué |
|---|---|
| [VPS_REQUIREMENTS.md](VPS_REQUIREMENTS.md) | Qué servidor contratar |
| [VPS_SETUP.md](VPS_SETUP.md) | Preparar Ubuntu (usuario, Docker, firewall, SSH) |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Guía completa de principio a fin |
| [DOMAIN_AND_DNS.md](DOMAIN_AND_DNS.md) | Registros DNS |
| [HTTPS_SETUP.md](HTTPS_SETUP.md) | Nginx + Let's Encrypt |
| [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | Todas las variables de `.env.production` |
| [DATABASE_SETUP.md](DATABASE_SETUP.md) | PostgreSQL + PostGIS, roles, migraciones, datos |
| [BACKUPS_AND_RESTORE.md](BACKUPS_AND_RESTORE.md) | Copias de seguridad y restauración |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Endurecimiento y checklist |
| [UPDATE_APPLICATION.md](UPDATE_APPLICATION.md) | Publicar una versión nueva |
| [ROLLBACK.md](ROLLBACK.md) | Volver atrás |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Errores comunes |
| [ANDROID_BUILD.md](ANDROID_BUILD.md) | APK de pruebas y AAB |
| [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) | Lista final antes de abrir al público |

## Arquitectura de producción

```
Internet ──► UFW (22, 80, 443) ──► Nginx (host, TLS Let's Encrypt, límites, fail2ban)
                                     │  midominio.mx        → 127.0.0.1:3000  contenedor web (Next.js)
                                     │  api.midominio.mx    → 127.0.0.1:8000  contenedor api (FastAPI)
                                     ▼
                     Docker Compose (infrastructure/docker-compose.prod.yml)
                     ┌─ red frontend (con salida a Internet) ─┐
                     │  web ──HTTP interno──► api ─► SMTP, Nominatim
                     └────────────────────────────────────────┘
                     ┌─ red backend (internal: sin salida) ───┐
                     │  migrate (job) ─► db (PostGIS 16, sin puertos publicados)
                     │  api ──────────► db      [osrm-* opcional, perfil routing]
                     └────────────────────────────────────────┘
App Android ──HTTPS──► api.midominio.mx
```

## Archivos de infraestructura

| Ruta | Contenido |
|---|---|
| `infrastructure/docker-compose.yml` | Entorno de **desarrollo** (ya existía) |
| `infrastructure/docker-compose.prod.yml` | Entorno de **producción** |
| `apps/api/Dockerfile` | Imagen de la API (ya existía; usuario 10001) |
| `apps/web/Dockerfile` + `.dockerignore` (raíz) | Imagen de la web (Next.js standalone, usuario 10001) |
| `infrastructure/postgres/init-prod/10-app-role.sh` | Crea el rol de BD sin superusuario |
| `infrastructure/nginx/` | Plantillas de Nginx (sitio, snippets TLS/cabeceras/proxy, límites) |
| `infrastructure/security/` | SSH, fail2ban, sysctl, `daemon.json` de Docker |
| `infrastructure/systemd/` | Timer de backup diario |
| `infrastructure/scripts/` | `install_vps.sh`, `generate_secrets.sh`, `configure_nginx.sh`, `deploy.sh`, `backup.sh`, `restore.sh`, `status.sh`, `logs.sh` |
| `.env.production.example` | Plantilla de variables de producción |
| `.github/workflows/infra.yml` | Validación de infraestructura en CI |
| `.github/workflows/deploy.yml` | Despliegue manual (deshabilitado por defecto) |
| `.github/workflows/android-build.yml` | Build Android manual en EAS (deshabilitado por defecto) |
