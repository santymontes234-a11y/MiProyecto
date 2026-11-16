# Arquitectura — EcoMove Querétaro

> Documento propiedad del agente **architect**. Cambios vía propuesta (ver `AGENTS.md` §4).
> Versión 0.1.0 — 2026-11-15

## 1. Visión

EcoMove Querétaro registra viajes de los ciudadanos de la Zona Metropolitana de Querétaro, calcula
las emisiones de CO₂ emitidas y evitadas según el modo de transporte, muestra infraestructura de
movilidad sostenible sobre OpenStreetMap y ofrece a la administración indicadores agregados.

## 2. Vista de contenedores

```
┌──────────────────┐   ┌──────────────────────┐
│ apps/mobile      │   │ apps/web (Next.js)   │
│ Expo + RN + TS   │   │ público / privado /  │
│ Android          │   │ panel admin          │
└────────┬─────────┘   └──────────┬───────────┘
         │  HTTPS + JSON  (Bearer JWT)          │
         │  cliente tipado: packages/shared     │
         └───────────────┬──────────────────────┘
                         ▼
              ┌──────────────────────┐        ┌─────────────────────────┐
              │ apps/api (FastAPI)   │        │ Tiles OSM               │
              │ /api/v1              │        │ (tile.openstreetmap.org │
              │ auth · users · trips │        │  o servidor propio)     │
              │ map · stats · admin  │        └─────────────────────────┘
              └──────────┬───────────┘                 ▲
                         │ SQLAlchemy 2 + GeoAlchemy2  │ los clientes piden
                         ▼                              │ tiles directamente
              ┌──────────────────────┐
              │ PostgreSQL 16+PostGIS│
              └──────────────────────┘
```

**Regla dura:** solo `apps/api` habla con la base de datos. Web y mobile consumen exclusivamente la
API definida en `API_CONTRACT.md`. Los tiles de OSM son la única dependencia externa que los
clientes consumen directamente (imágenes, sin datos de negocio).

## 3. Responsabilidades por capa

| Capa | Responsable de | NO hace |
|---|---|---|
| `apps/api` | Reglas de negocio, cálculo de CO₂, validación, autorización por rol, consultas geoespaciales, agregados de estadísticas | Renderizar UI |
| `apps/web` | UI pública (landing, mapa, estadísticas de ciudad), área privada (mis viajes), panel admin | Calcular CO₂, decidir permisos (solo oculta UI; la API autoriza) |
| `apps/mobile` | Registro de viajes con GPS, mapa, perfil, estadísticas personales | Calcular CO₂ definitivo (puede pedir `POST /trips/estimate`) |
| `packages/shared` | Tipos del contrato, enums, cliente HTTP tipado, tokens de diseño, formateadores puros | Lógica de negocio, acceso a datos |
| PostgreSQL/PostGIS | Persistencia, índices espaciales, integridad | Lógica de aplicación en triggers (salvo `updated_at`) |

## 4. Arquitectura del backend (`apps/api`)

Capas (dependencias solo hacia abajo):

```
routers/      → HTTP: parseo, códigos de estado, dependencias de auth
services/     → reglas de negocio (CO₂, rotación de tokens, agregados)
repositories/ → (opcional) consultas complejas reutilizables
models/       → SQLAlchemy ORM (propiedad del agente database)
schemas/      → Pydantic v2: DTOs de entrada/salida = API_CONTRACT.md
core/         → config, seguridad, errores, dependencias
db/           → engine, sesión, base declarativa
```

- Los routers **nunca** construyen SQL directo; delegan a `services/`.
- Los esquemas Pydantic son la fuente ejecutable del contrato; `API_CONTRACT.md` es la fuente
  humana. Ambos deben coincidir (revisión de integración, §9).
- OpenAPI se expone en `/api/v1/openapi.json`; los tipos de `packages/shared` se validan contra él.

## 5. Datos geoespaciales

- SRID de almacenamiento: **4326** (WGS84), compatible con OSM y GPS.
- Distancias: calculadas en el servidor con `ST_Length(geom::geography)` (metros), nunca confiando en
  la distancia enviada por el cliente.
- Intercambio con clientes: **GeoJSON** (RFC 7946), orden `[lng, lat]`.
- Consultas por área: parámetro `bbox=minLng,minLat,maxLng,maxLat` → `ST_MakeEnvelope(..., 4326)`
  con índices GiST.

## 6. Cálculo de CO₂ (única implementación: backend)

```
co2_emitted_g = distance_km × factor(mode)
co2_saved_g   = distance_km × (factor(CAR) − factor(mode))   (mínimo 0)
```

Los factores viven en la tabla `emission_factors` (editable por SUPER_ADMIN, versionada por
`valid_from`). Cada viaje guarda el factor aplicado (`emission_factor_g_per_km`) para que los
históricos no cambien al actualizar factores. Valores semilla en `DATABASE.md` §4.

## 7. Autenticación y autorización

JWT HS256 con access token (15 min) y refresh token (30 días) rotativo con detección de reutilización.
Detalle en `SECURITY.md`. Roles jerárquicos: `USER < ADMIN < SUPER_ADMIN`.

## 8. Decisiones de arquitectura (ADR)

| # | Decisión | Estado |
|---|---|---|
| [ADR-001](adr/ADR-001-monorepo.md) | Monorepo con npm workspaces + backend Python independiente | Aceptada |
| [ADR-002](adr/ADR-002-co2-backend-only.md) | El cálculo de CO₂ existe solo en el backend | Aceptada |
| [ADR-003](adr/ADR-003-token-storage.md) | Almacenamiento de tokens por plataforma | Aceptada |
| [ADR-004](adr/ADR-004-trip-upload.md) | Los viajes se registran en el dispositivo y se suben completos | Aceptada |
| [ADR-005](adr/ADR-005-mobile-map-leaflet-webview.md) | Mapa mobile con Leaflet empaquetado en WebView | Aceptada |

## 9. Revisión de integración

El arquitecto ejecuta la lista de verificación de `AGENTS.md` §7 al final de cada etapa y registra
hallazgos en `docs/INTEGRATION_REVIEW.md`.

## 10. Escalabilidad

- API sin estado → escalado horizontal detrás de un balanceador.
- Estadísticas: consultas agregadas con índices `(user_id, started_at)`; si crece el volumen,
  vistas materializadas `mv_daily_stats` refrescadas por job (etapa 5).
- Tiles: migrar de `tile.openstreetmap.org` a servidor propio/proveedor antes de producción
  (la política de uso de OSM prohíbe tráfico intensivo).
- Separación futura de un worker (tareas programadas) sin cambiar el contrato.
