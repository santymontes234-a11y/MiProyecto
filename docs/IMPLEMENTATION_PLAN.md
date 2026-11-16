# Plan de implementación por etapas

> Propiedad del architect. Cada etapa cierra con la revisión de integración (`AGENTS.md` §7).

## Etapa 0 — Fundaciones ✅ (architect)
- Monorepo, documentación, contrato v1.0, convenciones, CODEOWNERS.
- `packages/shared`: tipos, enums, cliente HTTP, tokens, formateadores.
- Docker Compose (PostGIS + API), esqueleto FastAPI con todos los routers del contrato.
- Migración inicial y semillas de factores de emisión.

## Etapa 1 — Identidad (backend + database → web + mobile)
- Backend: tests de integración de auth (registro, login, rotación, reutilización, logout).
- Web: BFF de sesión (`app/api/session/*`), login/registro, guardas de ruta por rol.
- Mobile: login/registro, `expo-secure-store`, refresh automático.
- **Criterio de salida:** usuario se registra en mobile e inicia sesión en web con la misma cuenta.

## Etapa 2 — Viajes y CO₂
- Backend: tests de `/trips`, `/trips/estimate`; validación de trazas.
- Mobile: grabación GPS en primer plano (`expo-location`), envío idempotente, lista e historial.
- Web: “Mis viajes” (lista y detalle con mapa).
- **Salida:** un viaje grabado en Android aparece en web con el mismo CO₂.

## Etapa 3 — Mapa
- **Geo** (asignado 2026-11-16): importación idempotente de ciclovías y POIs de la ZM de Querétaro desde OSM
  (Overpass) hacia `public.cycleways` / `public.pois` (`osm_id` único, `attributes.source="osm"`), como comando
  dentro de sus rutas de `apps/api`. Licencia ODbL: atribución visible en ambos clientes.
- Web + mobile: capas de POIs y ciclovías por bbox.
- **Salida:** el mapa de Querétaro muestra ciclovías reales en ambas plataformas.

## Etapa 3.5 — Contrato 1.1.0 (publicado 2026-11-16)

| Pieza | Dueño | Depende de |
|---|---|---|
| Cuenta: sesiones, reset/verificación (correo SMTP + Mailpit), bloqueo, preferencias, exportación, borrado | backend | — |
| Viajes: PATCH, recurrentes, estimación por lotes, validaciones 4.1, `source` + `route_token`, puntos | backend | — |
| Catálogos, zonas (`geo.mobility_zones`), medios, logros, ranking, notificaciones | backend | — |
| Reportes CSV/PDF, admin de viajes, reportes ciudadanos | backend | — |
| Montar `/admin/analytics/*` (+ `users-growth`, `infrastructure`) con los nombres de 1.1 | geo (+ backend monta) | — |
| `/routes`: servicio OSRM propio (perfiles foot/bicycle/car) y router | geo + architect (servicio `osrm` en compose) | extracto OSM de Querétaro |
| Web: pantallas de cuenta, gamificación, notificaciones, reportes ciudadanos, panel admin 1.1 y mapas analíticos (PR de geo) | web | backend 1.1 |
| Mobile: reset, sesiones, recurrentes, `/routes` + `PLANNED`, logros/ranking/notificaciones, reportes ciudadanos, `MODE_INACTIVE` | mobile | backend 1.1 |
| E2E 1.1 | qa | backend 1.1 |

Etapa 3 (importación OSM) ✅ 2026-11-16: 924 tramos de ciclovía y 1037 POIs.

## Etapa 4 — Estadísticas y panel admin
- Backend: series temporales, overview admin; rate limiting.
- Web: dashboard personal, estadísticas públicas de ciudad, panel admin (usuarios, POIs, factores, auditoría).
- Mobile: pantalla de estadísticas personales.
- **Salida:** un ADMIN desactiva un usuario y este pierde acceso de inmediato.

## Etapa 5 — Endurecimiento y producción
- CI (lint, typecheck, pytest, migraciones desde cero), imágenes de producción, proxy TLS.
- Vistas materializadas para estadísticas, respaldos, servidor de tiles propio.
- Borrado de cuenta y aviso de privacidad (LFPDPPP).
- Build Android firmado (EAS).

## Backlog (requiere propuesta aprobada antes de implementarse)
- Notificaciones push (Expo/FCM, `POST /devices`).
- Reportes asíncronos con worker si el volumen lo exige.
