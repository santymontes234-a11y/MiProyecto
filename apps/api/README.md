# EcoMove Querétaro — API (FastAPI + PostgreSQL/PostGIS)

Implementa el contrato `docs/API_CONTRACT.md` **v1.0.0** (26 rutas bajo `/api/v1`).
Las funciones de `docs/proposals/2026-11-15-backend-account-features.md` entran con el contrato 1.1.0.

## Estructura

```
app/
  main.py        # create_app(): CORS, middleware de seguridad, routers, bootstrap SUPER_ADMIN
  core/          # config (env), security (Argon2id, JWT), deps (auth/RBAC), errors, middleware, rate_limit, logging
  routers/       # HTTP: health, auth, users, trips, map, stats, admin
  services/      # reglas de negocio: auth, co2 (único cálculo), trips, stats, map, admin, users, audit
  schemas/       # Pydantic v2 = contrato ejecutable
  models/        # SQLAlchemy 2 + GeoAlchemy2
alembic/versions # 0001 esquema · 0002 semillas (roles, permisos, factores) · 0003 esquema geo (SQL congelado en alembic/sql/0003_geo)
tests/           # integración contra PostGIS real (tests/geo es del módulo geoespacial)
```

## Ejecutar en local

```bash
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
export POSTGRES_HOST=localhost POSTGRES_PASSWORD=... JWT_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(64))')"
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
```

OpenAPI: `/api/v1/openapi.json`, Swagger: `/api/v1/docs` (desactivar con `ENABLE_DOCS=false`).

Con Docker: `docker compose -f infrastructure/docker-compose.yml up --build`. El entrypoint aplica
`alembic upgrade head` y arranca uvicorn; con `RUN_MIGRATIONS=false` las migraciones se ejecutan aparte.

## Tests

Necesitan un servidor PostGIS. Cada ejecución crea su propia base `ecomove_test_<pid>` (o
`TEST_DATABASE_NAME`), la migra con Alembic, trunca los datos entre tests y la borra al terminar, así
que varias ejecuciones pueden compartir servidor.

```bash
docker run -d --name ecomove-test-db -e POSTGRES_USER=ecomove -e POSTGRES_PASSWORD=ecomove_test -p 127.0.0.1:54329:5432 postgis/postgis:16-3.4
TEST_DATABASE_ADMIN_URL=postgresql+psycopg://ecomove:ecomove_test@127.0.0.1:54329/postgres .venv/bin/pytest
```

## Variables de entorno

| Variable | Def. | Uso |
|---|---|---|
| `POSTGRES_*` / `DATABASE_URL_OVERRIDE` | — | conexión |
| `JWT_SECRET_KEY` | **obligatoria** | ≥ 32 caracteres; en producción no puede contener `change-me` |
| `JWT_ACCESS_TOKEN_EXPIRES_MINUTES` / `JWT_REFRESH_TOKEN_EXPIRES_DAYS` | 15 / 30 | |
| `CORS_ORIGINS` | vacío | lista blanca separada por comas; `*` prohibido en producción |
| `API_ENV` | development | `production` activa HSTS y validaciones estrictas |
| `ENABLE_DOCS` | true | Swagger/OpenAPI |
| `RATE_LIMIT_ENABLED`, `RATE_LIMIT_AUTH_PER_MINUTE`, `RATE_LIMIT_DEFAULT_PER_MINUTE` | true, 10, 120 | |
| `LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES` | 5, 15 | bloqueo de cuenta |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL` / `_PASSWORD` | — | crea el primer SUPER_ADMIN si no hay ninguno (contraseña ≥ 12) |

## Seguridad implementada

- Contraseñas con **Argon2id** (`argon2-cffi`), rehash automático al cambiar parámetros, verificación en tiempo constante aunque el email no exista.
- JWT HS256 con algoritmo fijo; refresh rotativo guardado solo como SHA-256; reutilizar un refresh revocado revoca toda la familia.
- Fuerza bruta: 5 fallos → bloqueo 15 min (en BD) + límite por email + 10 req/min/IP en `/auth/*`; 120 req/min por usuario o IP en el resto. El backend de rate limit es en memoria por proceso: con varias réplicas, cambiar a Redis (`app/core/rate_limit.py`).
- RBAC: rol y permisos leídos de la BD en cada petición (el claim `role` no autoriza); recursos ajenos → 404; reglas de jerarquía y ≥ 1 SUPER_ADMIN activo; auditoría de toda mutación admin.
- Entradas con Pydantic `extra="forbid"`; SQL solo vía ORM con parámetros enlazados; cuerpo ≤ 1 MB; trazas ≤ 10 000 puntos; bbox ≤ 0,5°.
- Errores con formato del contrato, sin trazas ni valores de entrada; 500 genérico.
- Cabeceras: CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`, HSTS en producción.
- Logs JSON sin querystring y con redacción de contraseñas, tokens y coordenadas.
- Imagen multi-stage sin dependencias de desarrollo, usuario no root, healthcheck.
