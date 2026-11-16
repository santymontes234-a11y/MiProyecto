# Panel web: reportes ciudadanos, evolución de usuarios, indicadores de infraestructura y exportación PDF
- **Autor (agente):** web
- **Estado:** Aprobada e incorporada a API_CONTRACT 1.1.0 (2026-11-16). `UsersGrowth`/`InfrastructureSummary` usan `meta: AnalyticsMeta` completa; `ReportType` unificado con backend; `audit_logs` solo SUPER_ADMIN.
- **Afecta a:** API_CONTRACT (→ 1.1.0, §7 y nuevo §7.2 `/citizen-reports`), apps/api, database, packages/shared, apps/web, apps/mobile (alta de reportes)
- **Relacionadas (no se duplican aquí):**
  - `2026-11-15-geo-analytics.md` (geo): serie temporal de ciudad, horas pico, zonas, flujos O-D («rutas frecuentes»), mapa de calor. **La web adopta sus nombres y parámetros tal cual** (`from`, `to`, `mode` repetible, `dataset=official|demo`, `meta.notes[]`, `suppressed`).
  - `2026-11-15-backend-account-features.md` (backend): `GET /admin/trips`, CRUD de zonas (`/admin/catalog/zones`), informes generados (`/admin/reports` + descarga CSV), preferencias y logros de usuario.
  - `2026-11-15-mobile-gamification.md` (mobile): logros y ranking.

## Motivación

El encargo del panel web pide, además de lo que ya da el contrato 1.0.0: reportes ciudadanos,
evolución de usuarios, indicadores de infraestructura y exportación CSV/PDF. Hoy la web muestra esas
secciones como «pendiente de contrato» (componente `PendingContract`), **sin datos simulados**.
Lo que ya resuelve la web sin contrato nuevo:

| Necesidad | Solución actual en web (1.0.0) |
|---|---|
| Exportar historial personal (CSV/PDF) | CSV generado en el navegador recorriendo `GET /trips` (page_size ≤ 100); PDF con la vista de impresión. Aprobado por architect. |
| Exportar listados admin (usuarios, auditoría, factores) | Mismo mecanismo sobre los endpoints paginados existentes. |
| Indicadores de infraestructura (provisional) | Conteo de `GET /map/pois` y suma de `length_m` de `GET /map/cycleways` en un bbox de 0.5°×0.5° centrado en Querétaro. Limitado a 500 POIs por consulta → se muestra «+». |
| Medios más usados / CO₂ por medio | `by_mode` de `/stats/city`, `/stats/me` y `/admin/stats/overview`. |

## Cambio propuesto

### 1. Evolución de usuarios (ADMIN) — dentro de la familia de geo

| Método | Ruta | Query | Respuesta |
|---|---|---|---|
| GET | `/admin/analytics/users-growth` | `granularity=day\|week\|month` (def. `month`), `from`, `to` | `UsersGrowth` |

```jsonc
// UsersGrowth — sin datos personales; timezone igual que /admin/analytics/timeseries
{ "granularity": "month", "timezone": "America/Mexico_City",
  "points": [ { "period_start": "2026-10-01T06:00:00Z", "new_users": 120, "total_users": 1480, "active_users": 640 } ],
  "meta": { "from": "...", "to": "...", "notes": [] } }
```

### 2. Indicadores de infraestructura (ADMIN)

Sustituye el conteo provisional del cliente (que no escala y está topado a 500 POIs).

| Método | Ruta | Query | Respuesta |
|---|---|---|---|
| GET | `/admin/analytics/infrastructure` | `bbox?` (def. zona metropolitana) | `InfrastructureSummary` |

```jsonc
{ "pois_by_category": { "BIKE_PARKING": 140, "BIKE_SHARING": 32, "BUS_STOP": 910, "EV_CHARGER": 18, "REPAIR_STATION": 6 },
  "pois_inactive": 12,
  "cycleways_length_m": 98000, "cycleways_protected_length_m": 41000,
  "meta": { "bbox": [-100.64, 20.34, -100.14, 20.84], "notes": [] } }
```

### 3. Reportes ciudadanos (nuevo §7.2)

Nombre `citizen-reports` para no chocar con `/admin/reports` (informes generados) de backend.

| Método | Ruta | Rol | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/citizen-reports` | USER | `CitizenReportCreate` | `201 CitizenReport` |
| GET | `/citizen-reports/mine` | USER | `page, page_size` | `200 Paginated<CitizenReport>` |
| GET | `/admin/citizen-reports` | ADMIN | `page, page_size, status?, category?, from?, to?, bbox?` | `200 Paginated<CitizenReport>` (con `reporter_id`, nunca email) |
| PATCH | `/admin/citizen-reports/{report_id}` | ADMIN | `{ "status": CitizenReportStatus, "resolution_note"?: str(≤1000) }` | `200 CitizenReport` · `404 CITIZEN_REPORT_NOT_FOUND` · genera AuditLog |

```jsonc
// Enums nuevos
// CitizenReportCategory: BIKE_LANE_DAMAGE | MISSING_INFRASTRUCTURE | SAFETY | POI_ISSUE | OTHER
// CitizenReportStatus:   OPEN | IN_REVIEW | RESOLVED | REJECTED
// CitizenReportCreate
{ "category": "BIKE_LANE_DAMAGE", "title": "Bache en ciclovía Zaragoza", "description": "...(≤2000)",
  "location": { "type": "Point", "coordinates": [-100.39, 20.59] }, "poi_id": "uuid|null" }
// CitizenReport
{ "id": "uuid", "category": "...", "status": "OPEN", "title": "...", "description": "...",
  "location": GeoJSONPoint, "poi_id": "uuid|null", "reporter_id": "uuid",
  "resolution_note": null, "created_at": "...", "updated_at": "..." }
```

Privacidad: el listado admin no expone email ni nombre del ciudadano; un ADMIN que necesite
contactarle usa `GET /admin/users/{id}` (queda auditado).

### 4. Exportación PDF de informes

Extender `POST /admin/reports` (propuesta de backend) con `format: "csv" | "pdf"` (def. `csv`) y
`GET /admin/reports/{report_id}/download` respondiendo `application/pdf` cuando aplique. Datasets
mínimos para el panel: `overview`, `users`, `trips` (sin trazas), `analytics_timeseries`,
`citizen_reports`, `audit_logs` (solo SUPER_ADMIN).

## Impacto en otros agentes

- **backend:** routers/servicios de §1–§4; AuditLog en `PATCH /admin/citizen-reports/*`.
- **database:** tabla `citizen_reports` (geom Point 4326 con índice GiST, FK `reporter_id` `ON DELETE SET NULL`, `poi_id` opcional).
- **geo:** `users-growth` e `infrastructure` viven bajo `/admin/analytics/*`; reutilizar `meta`.
- **shared (architect):** tipos `UsersGrowth`, `InfrastructureSummary`, `CitizenReport*` y métodos del cliente.
- **mobile:** pantalla opcional «Reportar un problema» (`POST /citizen-reports`).
- **web:** sustituir `PendingContract` en `/admin/reportes`, `/admin/estadisticas`, `/admin` y quitar el conteo provisional de infraestructura.

## Alternativas consideradas

- **Calcular la evolución de usuarios en el cliente** recorriendo `/admin/users`: descartado (descarga datos personales de todos los usuarios para obtener un agregado).
- **PDF solo en el cliente** (vista de impresión): se mantiene para el historial personal; para informes oficiales se necesita un documento generado y auditado en el servidor.
- **Reutilizar `/admin/reports`** para reportes ciudadanos: descartado por colisión semántica con los informes generados.

## Punto abierto para architect

Geo indica que el CRUD de zonas sería `/admin/zones`, mientras que la propuesta de backend usa
`/admin/catalog/zones`. La web consumirá el nombre que fije la 1.1.0.
