# Revisiones de integración

Registro de las revisiones del architect (checklist en `AGENTS.md` §7).

## Revisión #1 — 2026-11-15 (cierre de etapa 0)

| # | Hallazgo | Severidad | Dueño | Estado |
|---|---|---|---|---|
| 1 | El architect sobrescribió archivos que ya existían en `apps/api` (core, db, models, schemas, pyproject, Dockerfile) al crear el esqueleto. Los imports de `app/api/v1/auth.py` y `services/auth_service.py` quedaron rotos. | Alta | backend | `apps/api` cedido entero a backend, que lo rehace sobre el contrato. Se añadió una regla a AGENTS.md §1 («comprueba si ya existe») |
| 2 | Esquema paralelo `geo.*` (`geo.trips`, `geo.bike_lanes`, `geo.stations`, factores propios) que duplica las tablas canónicas | Alta | geo + backend | **Resuelto:** `geo.trips` eliminado. Las vistas `geo.v_*` operan sobre `public.*` y el SQL entra vía Alembic (backend) |
| 3 | Dos motores de CO₂ posibles (`app/geo/co2.py` y el `services/co2` previsto) | Alta | backend + geo | **Resuelto:** geo retira su `co2.py` como motor y la analítica suma los valores guardados por viaje |
| 4 | `apps/web/src/lib/api/{client,types,errors}.ts` duplica `@ecomove/shared` | Media | web | En curso: web lo borra y usa shared |
| 5 | `apps/web/src/lib/format.ts` `formatCo2(kg)` frente a la API en gramos y a shared `formatCo2(g)` | Media | web | En curso: usa los formateadores de shared |
| 6 | La paleta del DESIGN_SYSTEM no coincidía con la pedida por el usuario | Media | architect | Corregido: tokens y DESIGN_SYSTEM con la paleta del usuario, más la regla «nunca solo color» (WALK/BICYCLE) |
| 7 | `react-native-maps` exige una API key de Google en Android | Media | mobile | Resuelto con ADR-005 (Leaflet en WebView) |
| 8 | SECURITY.md decía bcrypt; el usuario pidió Argon2id | Baja | architect | Corregido |
| 9 | `schemas/stats.py`: `from_` sin alias `from` | Baja | backend | Notificado |
| 10 | Funciones pedidas fuera del contrato v1.0 (recuperación de contraseña, verificación de correo, gamificación, ruteo, analítica geo, CSV) | — | architect | Propuestas en `docs/proposals/`; se consolidarán en API_CONTRACT 1.1.0 |

Comprobaciones superadas: sin secretos versionados (solo `change-me` en `.env.example`); sin tokens
en `localStorage`; `packages/shared` compila con TS 6.0.3 estricto; `docker compose config` válido y
PostGIS 3.4.3 arranca con su healthcheck.

Pendiente para la revisión #2: que el backend arranque (`/api/v1/health`), que `alembic upgrade head`
funcione desde cero y comparar rutas con el contrato.

## Revisión QA/seguridad #1 — 2026-11-15 20:30 (agente QA)

Detalle: [`tests/reports/QA_REPORT.md`](../tests/reports/QA_REPORT.md) y
[`tests/reports/SECURITY_REPORT.md`](../tests/reports/SECURITY_REPORT.md). Batería E2E: `tests/e2e/api/` (114 casos).
Por indicación del architect, los imports rotos de `apps/api` no se reportan.

| # | Hallazgo | Severidad | Dueño | Estado |
|---|---|---|---|---|
| Q1 | Dos BFF de sesión (`/api/session/*` y `/api/auth/*` + `/api/bff`). `/api/session/login` y `/refresh` sin comprobación CSRF/Origin → login CSRF (SEC-01) | Alta | web | Notificado |
| Q2 | `lib/api/types.ts` con `Role = "CITIZEN"` (el contrato dice `USER`) y `TokenPair` sin `user` (INT-01; amplía el #4) | Alta | web | Notificado |
| Q3 | `apps/web/package.json` sin `lucide-react`, `recharts`, `zod`, `server-only` ni `vitest`: `tsc` da 20 errores y el build falla (INT-02) | Alta | web | Notificado |
| Q4 | Access token en cookie `em_at`, en contra de ADR-003; sin CSP en `next.config.ts`; variable `API_BASE_URL` frente a `API_INTERNAL_BASE_URL`; `proxy.ts` protege `/app`, que no existe, y no `/viajes` (SEC-02..05) | Media | web + architect | Notificado |
| Q5 | Perfil EAS `production` sin `EXPO_PUBLIC_API_BASE_URL`: cae a `http://10.0.2.2` (SEC-06) | Media | mobile | Notificado |
| Q6 | Códigos de error en minúsculas en `deps.py`/`middleware.py` (`invalid_token`, `rate_limited`…); usuario inactivo → 401 en vez de 403 `USER_INACTIVE` (SEC-07) | Media | backend | Notificado (diseño, no import) |
| Q7 | La migración 0001 crea `roles`/`permissions`/`transport_modes`/`achievements`, en contra de DATABASE.md (enum `user_role`, `emission_factors`) (SEC-08) | Media | database + architect | Pendiente de decisión (propuesta backend §8) |
| Q8 | `Dockerfile` con dependencias dev en runtime y `\|\| true`; migración en `CMD` (SEC-09) | Media | devops/backend | Notificado |

### Respuesta del architect a QA (Q4, Q7 y CI) — 2026-11-15

- **Q4/SEC-02 (cookie `em_at`)**: ya no aplica. La web actual guarda solo el refresh en `ecomove_rt`
  (HttpOnly, `path=/api/session`) y un indicador `ecomove_sess=1`; el access token queda en memoria.
  Se mantiene ADR-003.
- **Q7/SEC-08 (tablas de la migración)**: ya no aplica. Las migraciones `20261116_*` usan el enum
  `user_role` y `emission_factors`. `roles`/`permissions` internos están aprobados; `achievements`
  queda fuera hasta que se apruebe la gamificación.
- **CI**: añadido `.github/workflows/ci.yml` (typescript, api con migraciones de ida y vuelta, e2e
  sobre Docker Compose, secrets-scan) y los scripts `test`, `test:js`, `test:api`, `test:e2e` en la raíz.

## Revisión #2 — 2026-11-16 (cierre de etapa 1: contrato 1.0.1 implementado)

Entorno: stack completo (`infrastructure/docker-compose.yml`) levantado en un proyecto Docker
aislado, con `.env` efímero de secretos aleatorios; la imagen de la API se construyó desde cero.

| Comprobación (AGENTS.md §7) | Resultado |
|---|---|
| `docker compose up --wait` (db + api) y `/api/v1/health` | ✅ `{"status":"ok","database":"ok"}` |
| Migraciones desde volumen vacío (entrypoint `alembic upgrade head`) | ✅ |
| Rutas OpenAPI vs API_CONTRACT | ✅ 30 de 30, sin rutas extra (la analítica geo no está montada) |
| Batería E2E de QA (`tests/e2e/api`, caja negra) | ✅ 111 pasan, 2 omitidas (las de rate limit agotan la IP; activar con `E2E_RUN_RATE_LIMIT=1`), 1 xfail (reset de contraseña, fuera de 1.0.x) |
| Mobile: tsc, expo lint, Jest 32/32, `expo export android`, expo-doctor 20/20 | ✅ (informado por mobile) |
| Una sola copia de eslint/react/typescript en el lockfile raíz | ✅ |

Decisión de contrato: **1.0.1**. Si la contraseña actual es incorrecta, `POST /users/me/password`
devuelve 422 y no 401, para que los clientes no cierren la sesión.

Pendiente: consolidar API_CONTRACT 1.1.0 con las propuestas de backend (cuenta), mobile (ruteo,
gamificación), geo (analítica) y web (admin analytics, reportes, exportaciones); ejecutar las
pruebas de rate limit en un job aparte de la CI.

## Publicación del contrato 1.1.0 — 2026-11-16

- Consolidadas 6 propuestas → 88 rutas. `packages/shared` en TS 6.0.3 estricto: OK; las 88 rutas del
  contrato tienen su método en el cliente (comprobación automática). Web `tsc`: OK.
- Mobile `tsc`: 3 errores esperados por los cambios ⚠ (`register` → `TokenPair | MessageResponse`,
  `User.email_verified`/`ranking_opt_in`). Notificado a mobile.
- Conflicto resuelto: `from`/`to` son siempre fechas; las coordenadas usan `origin`/`destination`
  (`/routes`, `/admin/analytics/distance`). `zone_kind` → `kind`.
- Etapa 3 (OSM) ✅: 924 tramos de ciclovía y 1037 POIs; `/map/*` devuelve datos reales.
- Pendiente: implementación backend 1.1; servicio `osrm` en compose (architect + geo); E2E 1.1 (QA).
