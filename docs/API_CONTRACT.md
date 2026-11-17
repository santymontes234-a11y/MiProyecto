# Contrato de API — EcoMove Querétaro

> **Fuente de verdad** para web, mobile y backend. Propiedad del agente **architect**.
> Ningún agente puede crear, renombrar o eliminar endpoints sin una propuesta aprobada
> (`AGENTS.md` §4). Implementación ejecutable: `apps/api/app/schemas/` + `apps/api/app/routers/`.
> Tipos TypeScript equivalentes: `packages/shared/src/types/api.ts`.
>
> Versión del contrato: **1.2.2** — 2026-11-16 · Lo nuevo de 1.1 va marcado con **🆕**; lo de 1.2, con **🆕 1.2**.
> Todo 1.1.0 es aditivo respecto a 1.0.x, salvo los cambios de comportamiento marcados con **⚠**.

## 0. Convenciones generales

| Aspecto | Regla |
|---|---|
| Base URL | `/api/v1` |
| Formato | JSON UTF-8. Campos en `snake_case`. |
| Fechas | ISO 8601 con zona horaria, UTC en respuestas (`2026-11-15T18:30:00Z`). Fechas sin hora (`2026-11-15`) solo donde se indique. |
| IDs | UUID v4 en texto. |
| Geometrías | GeoJSON RFC 7946, coordenadas `[lng, lat]`, SRID 4326. |
| Auth | `Authorization: Bearer <access_token>` |
| Paginación | Query `page` (≥1, def. 1) y `page_size` (1–100, def. 20). |
| Unidades | distancia en metros (`*_m`), duración en segundos (`*_s`), CO₂ en gramos (`*_g`). |
| `from` / `to` | **Siempre fechas** (rango `[from, to)`). Las coordenadas sueltas usan `origin` / `destination` con formato `lng,lat`. 🆕 |
| `bbox` | `minLng,minLat,maxLng,maxLat`, área máx. 0.5°×0.5° (`400 BBOX_TOO_LARGE`, `400 BBOX_INVALID`). |
| Zona horaria de agregados | Los periodos (`day`/`week`/`month`, horas pico) se cortan en `America/Mexico_City` y se devuelven en UTC. 🆕 |

### Respuesta paginada

```json
{ "items": [ ... ], "total": 134, "page": 1, "page_size": 20 }
```

### Formato de error (todas las respuestas 4xx/5xx)

```json
{ "error": { "code": "TRIP_NOT_FOUND", "message": "Viaje no encontrado", "details": null } }
```

| HTTP | `code` |
|---|---|
| 400 | `BAD_REQUEST`, `BBOX_INVALID`, `BBOX_TOO_LARGE`, 🆕 `RESET_TOKEN_INVALID`, `VERIFICATION_TOKEN_INVALID`, `DATE_RANGE_INVALID`, `DATE_RANGE_TOO_LARGE`, `GRID_TOO_LARGE` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_INVALID` |
| 403 | `FORBIDDEN`, `USER_INACTIVE`, 🆕 `EMAIL_NOT_VERIFIED` |
| 404 | `NOT_FOUND`, `<ENTIDAD>_NOT_FOUND` (🆕 `SESSION_`, `ZONE_`, `ACHIEVEMENT_`, `REPORT_`, `CITIZEN_REPORT_`, `NOTIFICATION_`, `ROUTE_`) |
| 409 | `EMAIL_ALREADY_REGISTERED`, `CONFLICT`, 🆕 `TRIP_DUPLICATE` |
| 413 | `PAYLOAD_TOO_LARGE` (cuerpo > 1 MB) |
| 422 | `VALIDATION_ERROR` (`details` = lista de errores por campo), 🆕 `TRIP_OUTSIDE_SERVICE_AREA`, `TRIP_IMPLAUSIBLE_SPEED`, `TRIP_TOO_SHORT`, `MODE_INACTIVE`, `ROUTE_TOKEN_INVALID` |
| 429 | `RATE_LIMITED` (con cabecera `Retry-After`; 🆕 también por bloqueo de cuenta) |
| 500 | `INTERNAL_ERROR` |
| 503 | 🆕 `ROUTING_UNAVAILABLE` |

### Enums

| Enum | Valores |
|---|---|
| `Role` | `USER`, `ADMIN`, `SUPER_ADMIN` |
| `TransportMode` | `WALK`, `BICYCLE`, `E_SCOOTER`, `BUS`, `CARPOOL`, `MOTORCYCLE`, `CAR` |
| `TripStatus` | `COMPLETED`, `CANCELLED` |
| `PoiCategory` | `BIKE_PARKING`, `BIKE_SHARING`, `BUS_STOP`, `EV_CHARGER`, `REPAIR_STATION` |
| `Granularity` | `day`, `week`, `month` |
| 🆕 `TripSource` | `GPS` (grabado en el dispositivo), `PLANNED` (ruta calculada por `/routes`) |
| 🆕 `ZoneKind` | `colonia`, `ageb`, `municipio`, `distrito`, `custom` |
| 🆕 `AchievementCriterion` | `TRIPS_COUNT`, `DISTANCE_M`, `CO2_SAVED_G`, `DISTINCT_MODES` |
| 🆕 `NotificationType` | `ACHIEVEMENT_UNLOCKED`, `WEEKLY_SUMMARY`, `SYSTEM` |
| 🆕 `CitizenReportCategory` | `BIKE_LANE_DAMAGE`, `MISSING_INFRASTRUCTURE`, `SAFETY`, `POI_ISSUE`, `OTHER` |
| 🆕 `CitizenReportStatus` | `OPEN`, `IN_REVIEW`, `RESOLVED`, `REJECTED` |
| 🆕 `ReportType` | `overview`, `trips`, `users`, `co2_by_mode`, `co2_by_zone`, `analytics_timeseries`, `citizen_reports`, `audit_logs` |
| 🆕 `ReportFormat` | `csv`, `pdf` |
| 🆕 `AnalyticsDataset` | `official`, `demo` |
| 🆕 `RankingPeriod` | `week`, `month`, `all` |

### Columna "Rol"

`público` = sin token · `USER` = cualquier usuario autenticado · `ADMIN` = ADMIN o SUPER_ADMIN ·
`SUPER_ADMIN` = solo SUPER_ADMIN. Internamente cada rol se traduce en permisos (anexo A), pero la API
expone siempre `role` como string.

---

## 1. Salud

| Método | Ruta | Rol | Respuesta |
|---|---|---|---|
| GET | `/health` | público | `200 { "status": "ok", "database": "ok" }` |

## 2. Autenticación — `/auth`

| Método | Ruta | Rol | Body | Respuesta |
|---|---|---|---|---|
| POST | `/auth/register` | público | `RegisterRequest` | `201 TokenPair` (⚠ ver §2.2) |
| POST | `/auth/login` | público | `LoginRequest` | `200 TokenPair` |
| POST | `/auth/refresh` | público | `RefreshRequest` | `200 TokenPair` (rota el refresh) |
| POST | `/auth/logout` | público | `RefreshRequest` | `204` (revoca el refresh) |
| POST | 🆕 `/auth/logout-all` | USER | — | `204`; revoca todos los refresh y los access ya emitidos |
| GET | 🆕 `/auth/sessions` | USER | — | `200 Session[]` |
| DELETE | 🆕 `/auth/sessions/{session_id}` | USER (dueño) | — | `204` · `404 SESSION_NOT_FOUND` (también si es de otro usuario) |
| POST | 🆕 `/auth/password-reset/request` | público | `{ "email": str }` | `202 { "message": str }` **siempre**, exista o no la cuenta |
| POST | 🆕 `/auth/password-reset/confirm` | público | `{ "token": str, "new_password": Password }` | `204`; revoca todos los refresh y access · `400 RESET_TOKEN_INVALID` |
| POST | 🆕 `/auth/email-verification/request` | público | `{ "email": str }` | `202 { "message": str }` **siempre** |
| POST | 🆕 `/auth/email-verification/confirm` | público | `{ "token": str }` | `204` · `400 VERIFICATION_TOKEN_INVALID` |

```jsonc
// RegisterRequest
{ "email": "ana@example.com", "password": "min 8, letra y número", "full_name": "Ana López" }
// LoginRequest
{ "email": "ana@example.com", "password": "..." }
// RefreshRequest
{ "refresh_token": "..." }
// TokenPair
{
  "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "bearer",
  "expires_in": 900,           // segundos de vida del access token
  "user": User
}
// 🆕 Session — una por familia de refresh tokens (= un dispositivo o navegador)
{ "id": "uuid", "created_at": "...", "last_used_at": "...", "expires_at": "...",
  "user_agent": "okhttp/4.12 | Mozilla/5.0 ... | null", "current": true }
```

Errores: `409 EMAIL_ALREADY_REGISTERED`, `401 INVALID_CREDENTIALS`, `403 USER_INACTIVE`,
`401 TOKEN_INVALID` (refresh revocado/reutilizado → se revoca toda la familia de tokens).

**2.1 🆕 Tokens de un solo uso** (reset y verificación): ≥ 256 bits aleatorios, guardados solo como
hash SHA-256, caducan a los 30 min (reset) / 48 h (verificación); pedir uno nuevo invalida el anterior.
Enlaces: `ecomove://reset-password?token=…` · `<WEB_URL>/restablecer-contrasena?token=…` ·
`ecomove://verify-email?token=…` · `<WEB_URL>/verificar-correo?token=…`. Rate limit por IP y por email.

**2.2 ⚠ Verificación de correo.** `register` envía el correo de verificación. Con
`REQUIRE_EMAIL_VERIFICATION=false` (por defecto) la cuenta funciona sin verificar y `register` sigue
respondiendo `201 TokenPair`. Con `true`: `register` responde `202 { "message" }` **sin tokens**, y
`login`/`refresh` de una cuenta sin verificar responden `403 EMAIL_NOT_VERIFIED`. Los clientes deben
aceptar ambas respuestas de `register`.

**2.3 🆕 Bloqueo por fuerza bruta.** 5 contraseñas incorrectas seguidas → cuenta bloqueada 15 min;
`login` responde `429 RATE_LIMITED` con `Retry-After`. Hay además un límite por email
(10 intentos/15 min) que se aplica igual a emails inexistentes, para no revelar cuentas.

## 3. Usuarios — `/users`

| Método | Ruta | Rol | Body | Respuesta |
|---|---|---|---|---|
| GET | `/users/me` | USER | — | `200 User` |
| PATCH | `/users/me` | USER | `UserUpdate` | `200 User` |
| POST | `/users/me/password` | USER | `PasswordChange` | `204`; revoca todos los refresh y ⚠ también los access ya emitidos |
| GET | 🆕 `/users/me/preferences` | USER | — | `200 Preferences` |
| PUT | 🆕 `/users/me/preferences` | USER | `Preferences` | `200 Preferences` |
| GET | 🆕 `/users/me/achievements` | USER | — | `200 UserAchievement[]` (todos los logros activos, con progreso) |
| GET | 🆕 `/users/me/export` | USER | — | `200 UserExport` (`Content-Disposition: attachment`) |
| DELETE | 🆕 `/users/me` | USER | `{ "password": str }` | `204`; borrado físico · `403 FORBIDDEN` si es el último SUPER_ADMIN activo |

```jsonc
// User
{
  "id": "uuid", "email": "ana@example.com", "full_name": "Ana López",
  "role": "USER", "is_active": true, "created_at": "2026-11-15T18:30:00Z",
  "email_verified": false,      // 🆕
  "ranking_opt_in": false       // 🆕 aparece en el ranking solo si es true (por defecto false)
}
// UserUpdate (todos opcionales)
{ "full_name": "Ana L.", "ranking_opt_in": true /* 🆕 */ }
// PasswordChange
{ "current_password": "...", "new_password": "..." }
// 🆕 Preferences (todos con valor por defecto)
{ "language": "es" | "en", "default_mode": TransportMode | null,
  "weekly_goal_trips": 1..100 | null, "email_notifications": true }
// 🆕 UserExport (LFPDPPP, derecho de acceso)
{ "exported_at": "...", "user": User, "preferences": Preferences,
  "trips": Trip[],                       // con trazas completas
  "achievements": UserAchievement[], "stats": StatsSummary,
  "notifications": Notification[], "citizen_reports": CitizenReport[] }
```

Si `current_password` es incorrecta → `422 VALIDATION_ERROR` con
`details: [{ "loc": ["body", "current_password"], ... }]`. **No** devuelve 401, porque los clientes
interpretan un 401 como sesión caducada y cerrarían la sesión. Lo mismo para `password` incorrecta en
`DELETE /users/me`.

🆕 Borrado de cuenta: elimina usuario, viajes (trazas), tokens, logros, preferencias y notificaciones.
Los reportes ciudadanos quedan con `reporter_id = null`. En `audit_logs`, `actor_id` pasa a `null`
y se registra `USER_SELF_DELETED` sin email.

## 4. Viajes — `/trips`

| Método | Ruta | Rol | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/trips/estimate` | USER | `TripEstimateRequest` | `200 TripEstimate` |
| POST | 🆕 `/trips/estimate/batch` | USER | `TripEstimateBatchRequest` | `200 { "items": TripEstimate[] }` (mismo orden que `modes`) |
| POST | `/trips` | USER | `TripCreate` | `201 Trip` · `200 Trip` si `client_trip_id` ya existía |
| GET | `/trips` | USER | `page, page_size, mode?, from?, to?` | `200 Paginated<TripSummary>` |
| GET | `/trips/{trip_id}` | USER (dueño) | — | `200 Trip` |
| PATCH | 🆕 `/trips/{trip_id}` | USER (dueño) | `TripUpdate` | `200 Trip` (recalcula distancia, duración, CO₂ y puntos) |
| DELETE | `/trips/{trip_id}` | USER (dueño) | — | `204` |
| POST | 🆕 `/trips/recurring` | USER | `RecurringTripCreate` | `201 RecurringTripResult` |

```jsonc
// TripEstimateRequest — usar route o distance_m (exactamente uno)
{ "mode": "BICYCLE", "route": GeoJSONLineString | null, "distance_m": 4200 | null }
// 🆕 TripEstimateBatchRequest — misma regla route | distance_m
{ "modes": ["WALK", "BICYCLE", "BUS"],    // 1..7, sin repetidos
  "route": GeoJSONLineString | null, "distance_m": 4830 | null }
// TripEstimate
{ "mode": "BICYCLE", "distance_m": 4200, "co2_emitted_g": 0, "co2_saved_g": 806.4,
  "emission_factor_g_per_km": 0,
  "points_estimate": 8 }                   // 🆕

// TripCreate
{
  "client_trip_id": "uuid",              // idempotencia (ADR-004)
  "mode": "BICYCLE",
  "started_at": "2026-11-15T08:00:00Z",
  "ended_at": "2026-11-15T08:20:00Z",    // > started_at, duración ≤ 24 h
  "route": { "type": "LineString", "coordinates": [[-100.39, 20.59], ...] },  // 2..10000 puntos
  "source": "GPS",                       // 🆕 opcional, def. "GPS"
  "route_token": "..."                   // 🆕 obligatorio si y solo si source = "PLANNED" (§12)
}
// 🆕 TripUpdate (todos opcionales). source y route_token siguen las reglas de TripCreate.
{ "mode": TransportMode, "status": TripStatus, "started_at": "...", "ended_at": "...",
  "route": GeoJSONLineString, "source": TripSource, "route_token": "..." }

// TripSummary
{
  "id": "uuid", "mode": "BICYCLE", "status": "COMPLETED",
  "started_at": "...", "ended_at": "...", "distance_m": 4200, "duration_s": 1200,
  "co2_emitted_g": 0, "co2_saved_g": 806.4,
  "source": "GPS", "recurrence_id": "uuid|null", "points": 8     // 🆕
}
// Trip = TripSummary +
{ "client_trip_id": "uuid", "emission_factor_g_per_km": 0, "route": GeoJSONLineString,
  "created_at": "...", "updated_at": "..." /* 🆕 */ }

// 🆕 RecurringTripCreate — un viaje por cada día marcado del rango; solo fechas pasadas
{ "mode": "BICYCLE", "route": GeoJSONLineString,
  "start_date": "2026-10-01", "end_date": "2026-11-14",   // fechas sin hora; máx. 366 días; end_date ≤ hoy
  "weekdays": [0, 1, 2, 3, 4],                            // 0 = lunes … 6 = domingo
  "departure_time": "08:00", "duration_s": 1200,          // 60..86400
  "utc_offset_minutes": -360 }                            // Querétaro: UTC-6
// 🆕 RecurringTripResult
{ "recurrence_id": "uuid", "created": 30, "skipped_duplicates": 2, "trip_ids": ["uuid", ...] }
```

Errores: `404 TRIP_NOT_FOUND` (también si el viaje es de otro usuario — no se revela su existencia),
`422 VALIDATION_ERROR`.

**4.1 🆕 Validaciones de negocio** (en `POST /trips`, `PATCH /trips/{id}` y `/trips/recurring`; las de
ruta y medio también en `/trips/estimate*`):

| Regla | Error |
|---|---|
| Toda la ruta dentro del área de servicio (bbox configurable del estado de Querétaro) | `422 TRIP_OUTSIDE_SERVICE_AREA` |
| Distancia ≥ 50 m | `422 TRIP_TOO_SHORT` |
| Velocidad media ≤ `max_speed_kmh` del medio (§8) | `422 TRIP_IMPLAUSIBLE_SPEED` |
| Medio activo (§8) | `422 MODE_INACTIVE` con `details: { "mode": "E_SCOOTER" }` |
| Sin solape `[started_at, ended_at]` con otro viaje `COMPLETED` del mismo usuario y medio | `409 TRIP_DUPLICATE` con `details: { "trip_id": "uuid" }` |
| `route_token` válido, no caducado y para esa misma geometría y medio (si `source = PLANNED`) | `422 ROUTE_TOKEN_INVALID` |

Un reintento idempotente con un `client_trip_id` existente responde siempre `200` con el viaje guardado,
aunque después el medio se haya desactivado o el viaje pudiera solaparse. En `/trips/recurring` los
duplicados se omiten y se cuentan en `skipped_duplicates`. Mobile, que graba sin conexión, debe
conservar en local los viajes rechazados con `MODE_INACTIVE` y avisar al usuario.

**4.2 🆕 Puntos.** Los calcula solo el backend (igual que el CO₂, ADR-002): por viaje `COMPLETED`,
`points = floor(co2_saved_g / 100)`; se guardan en el viaje (cambiar la regla no altera viajes
pasados). Los logros pueden sumar `bonus_points` (§9). `CANCELLED` = 0 puntos.


**4.3 🆕 1.2 Tipo de vehículo y ocupantes** (observaciones O4/O5 del usuario). Campos **opcionales** en
`TripEstimateRequest`, `TripEstimateBatchRequest`, `TripCreate` y `TripUpdate`; `Trip`, `TripSummary` y
`TripEstimate` los devuelven (`null` si no aplican):

```jsonc
{ "vehicle_type": "SUV",   // VehicleType; solo para CAR y CARPOOL (otro medio → 422 VALIDATION_ERROR)
  "occupants": 3 }          // 1..8, solo CAR y CARPOOL; CARPOOL exige ≥ 2; por omisión CAR = 1, CARPOOL = 2
```

`VehicleType` = `COMPACT`, `SEDAN`, `SUV`, `PICKUP`, `MINIVAN`, `HYBRID`, `ELECTRIC`. Si falta
`vehicle_type` se usa `user_preferences.default_vehicle_type` y, si tampoco existe, `SEDAN`.

Cálculo (solo backend, ADR-002), con `f(v)` = factor g/km del tipo de vehículo (tabla `vehicle_types`,
con fuente citada):
- CAR / CARPOOL: `co2_emitted_g = km × f(v) / occupants`; `co2_saved_g = km × f(v) − co2_emitted_g`
  (1.2.2: en estos medios `emission_factor_g_per_km` se devuelve **por persona**, `f(v) / occupants`)
  (ahorro frente a ir solo en el mismo vehículo).
- Resto de medios: sin cambios (`km × (f(CAR) − f(mode))`), con `f(CAR)` = `f(SEDAN)` o el
  `default_vehicle_type` del usuario.
- Puntos sin cambios: `floor(co2_saved_g / 100)`.

## 5. Mapas — `/map`

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/map/pois` | público | `bbox` (obligatorio), `category?` (repetible), `limit` (≤500, def. 200) | `200 FeatureCollection<Poi>` |
| GET | `/map/pois/{poi_id}` | público | — | `200 Feature<Poi>` |
| GET | `/map/cycleways` | público | `bbox` (obligatorio) | `200 FeatureCollection<Cycleway>` |

```jsonc
// Feature<Poi>
{ "type": "Feature", "id": "uuid",
  "geometry": { "type": "Point", "coordinates": [-100.39, 20.59] },
  "properties": { "name": "Ciclopuerto Centro", "category": "BIKE_PARKING",
                  "description": "..." , "attributes": { "capacity": 20 } } }
// Feature<Cycleway>
{ "type": "Feature", "id": "uuid",
  "geometry": { "type": "LineString", "coordinates": [...] },
  "properties": { "name": "Ciclovía Zaragoza", "is_protected": true, "length_m": 3200 } }
```

**5.1 🆕 Paradas y estaciones = POIs** (`BUS_STOP`, `BIKE_SHARING`, `BIKE_PARKING`; no hay entidad
aparte). `attributes` admite por convención `{ "code": "QB-001", "lines": ["L1", "L2"] }`
(`code`: `^[A-Z0-9_-]{2,32}$`, único entre paradas → `409 CONFLICT` si se repite; `lines`: ≤ 50
strings de ≤ 32). `code` es el código **oficial** asignado por un administrador. Los POIs importados de
OSM llevan `attributes.source = "osm"`, `attributes.osm_id` y, si existe, `attributes.ref` (la etiqueta `ref` de OSM,
**no única**: puede repetirse entre operadores y sentidos). El import nunca escribe `code` (1.1.1).

## 6. Estadísticas — `/stats`

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/stats/me` | USER | `from?, to?` | `200 StatsSummary` |
| GET | `/stats/me/timeseries` | USER | `granularity, from, to` | `200 TimeSeries` |
| GET | `/stats/city` | público | `from?, to?` | `200 StatsSummary` (agregado anónimo) |

```jsonc
// StatsSummary
{
  "from": "...|null", "to": "...|null",
  "trips_count": 42, "distance_m": 180000, "duration_s": 54000,
  "co2_emitted_g": 1200.5, "co2_saved_g": 25000.0,
  "by_mode": [ { "mode": "BICYCLE", "trips_count": 30, "distance_m": 120000,
                 "co2_saved_g": 23040.0 } ]
}
// TimeSeries
{ "granularity": "week",
  "points": [ { "period_start": "2026-11-09T00:00:00Z", "trips_count": 5,
                "distance_m": 20000, "co2_saved_g": 3000 } ] }
```

`/stats/city` nunca expone datos individuales; devuelve `trips_count` solo si ≥ 10 viajes en el rango
(k-anonimato básico); si no, `200` con ceros. Las estadísticas incluyen viajes `GPS` y `PLANNED`.

## 7. Administración — `/admin`

| Método | Ruta | Rol | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/admin/users` | ADMIN | `page, page_size, q?, role?, is_active?` | `200 Paginated<User>` |
| GET | `/admin/users/{user_id}` | ADMIN | — | `200 User` |
| PATCH | `/admin/users/{user_id}/status` | ADMIN | `{ "is_active": bool, "reason"?: str(5..500) /* 🆕 */ }` | `200 User` |
| PATCH | `/admin/users/{user_id}/role` | SUPER_ADMIN | `{ "role": Role }` | `200 User` · ⚠ revoca las sesiones del usuario: sus access dan `401 TOKEN_INVALID` (1.2.2) |
| DELETE | 🆕 `/admin/users/{user_id}` | SUPER_ADMIN | `{ "reason": str(5..500) }` | `204` |
| GET | `/admin/stats/overview` | ADMIN | `from?, to?` | `200 AdminOverview` |
| GET | 🆕 `/admin/trips` | ADMIN | `page, page_size, user_id?, mode?, status?, source?, from?, to?` | `200 Paginated<AdminTripSummary>` |
| DELETE | 🆕 `/admin/trips/{trip_id}` | ADMIN | `{ "reason": str(5..500) }` | `204` |
| POST | `/admin/map/pois` | ADMIN | `PoiCreate` | `201 Feature<Poi>` |
| PATCH | `/admin/map/pois/{poi_id}` | ADMIN | `PoiUpdate` | `200 Feature<Poi>` |
| DELETE | `/admin/map/pois/{poi_id}` | ADMIN | — | `204` (borrado lógico) |
| POST | 🆕 `/admin/zones` | ADMIN | `ZoneCreate` | `201 Feature<Zone>` |
| PATCH | 🆕 `/admin/zones/{zone_id}` | ADMIN | `ZoneUpdate` | `200 Feature<Zone>` |
| DELETE | 🆕 `/admin/zones/{zone_id}` | ADMIN | — | `204` (borrado físico) |
| GET | `/admin/emission-factors` | ADMIN | — | `200 EmissionFactor[]` |
| PUT | `/admin/emission-factors/{mode}` | SUPER_ADMIN | `{ "grams_per_km": number }` | `200 EmissionFactor` |
| PATCH | 🆕 `/admin/transport-modes/{mode}` | SUPER_ADMIN | `{ "max_speed_kmh"?: number(0..300], "is_active"?: bool }` | `200 TransportModeInfo` |
| POST | 🆕 `/admin/achievements` | ADMIN | `AchievementCreate` | `201 Achievement` |
| PATCH | 🆕 `/admin/achievements/{achievement_id}` | ADMIN | `AchievementUpdate` | `200 Achievement` |
| GET | 🆕 `/admin/reports` | ADMIN | `page, page_size` | `200 Paginated<Report>` |
| POST | 🆕 `/admin/reports` | ADMIN | `ReportCreate` | `201 Report` |
| GET | 🆕 `/admin/reports/{report_id}/download` | ADMIN | — | `200 text/csv` o `application/pdf` · `404 REPORT_NOT_FOUND` |
| GET | `/admin/audit-logs` | SUPER_ADMIN | `page, page_size, actor_id?, action?` | `200 Paginated<AuditLog>` |

Reglas:
- Un ADMIN no puede desactivar a un ADMIN ni SUPER_ADMIN (`403 FORBIDDEN`).
- Nadie puede cambiar su propio rol, desactivarse ni borrarse desde `/admin` (`403 FORBIDDEN`).
- Debe existir siempre ≥ 1 SUPER_ADMIN activo (`409 CONFLICT`).
- Toda operación `/admin` que modifica datos genera un `AuditLog` (🆕 también crear y descargar reportes).
  `reason` se guarda en el payload del AuditLog.
- 🆕 Los administradores **nunca** reciben trazas de viajes ajenos (SECURITY.md §5).

```jsonc
// AdminOverview
{ "users_total": 1500, "users_active_30d": 640, "trips_total": 22000,
  "co2_saved_g": 5400000, "distance_m": 98000000,
  "by_mode": [ /* igual que StatsSummary.by_mode */ ] }
// 🆕 AdminTripSummary = TripSummary + { "user_id": "uuid" }   — sin traza
// PoiCreate
{ "name": "...", "category": "BUS_STOP", "description": "...|null",
  "location": { "type": "Point", "coordinates": [-100.39, 20.59] }, "attributes": {} }
// PoiUpdate — PoiCreate con todos los campos opcionales + "is_active"?: bool
// 🆕 ZoneCreate — se valida con ST_IsValid y se normaliza a MultiPolygon; source "DEMO" no se acepta
{ "code": "^[A-Z0-9_-]{2,32}$", "name": "str(2..120)", "kind": ZoneKind, "source": "str(2..80)",
  "geometry": GeoJSONPolygon | GeoJSONMultiPolygon }
// 🆕 ZoneUpdate — ZoneCreate con todo opcional salvo code (inmutable)
// EmissionFactor
{ "mode": "CAR", "grams_per_km": 192.0, "valid_from": "...", "updated_by": "uuid|null" }
// 🆕 AchievementCreate
{ "code": "^[A-Z0-9_]{2,40}$", "name": "str(2..80)", "description": "str(≤300)",
  "icon": "str(≤40)", "criterion": AchievementCriterion, "threshold": "> 0",
  "bonus_points": "0..10000", "is_active": true }
// 🆕 AchievementUpdate — AchievementCreate con todo opcional salvo code (inmutable)
// 🆕 ReportCreate — report_type "audit_logs" solo SUPER_ADMIN (403 FORBIDDEN)
{ "report_type": ReportType, "format": "csv" | "pdf" /* def. csv */,
  "from": "...|null", "to": "...|null" }
// 🆕 Report
{ "id": "uuid", "report_type": "trips", "format": "csv",
  "parameters": { "from": null, "to": null }, "row_count": 120,
  "created_by": "uuid|null", "created_at": "..." }
// AuditLog
{ "id": "uuid", "actor_id": "uuid|null", "action": "USER_ROLE_CHANGED",
  "entity_type": "user", "entity_id": "uuid", "payload": {}, "created_at": "..." }
```

**7.1 🆕 Contenido de los reportes.** Sin trazas, coordenadas, emails ni nombres. `trips`: id, user_id,
mode, source, status, started_at, ended_at, distance_m, duration_s, co2_emitted_g, co2_saved_g ·
`users`: id, role, is_active, email_verified, created_at, trips_count · `co2_by_mode`, `co2_by_zone`,
`overview`, `analytics_timeseries`: agregados (con k-anonimato de §13) · `citizen_reports`: sin
`reporter_id` · `audit_logs`: payload incluido. CSV: celdas que empiezan con `= + - @` se escapan.
Generación síncrona, máx. 100 000 filas.

`DELETE /admin/zones/{id}` guarda en el AuditLog `{ code, name, kind, source, area_km2, bbox }`, sin la
geometría completa.

## 8. 🆕 Catálogos — `/catalog`

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/catalog/transport-modes` | público | — | `200 TransportModeInfo[]` |
| GET | `/catalog/zones` | público | `bbox?`, `kind?` | `200 FeatureCollection<Zone>` (nunca zonas DEMO) |

```jsonc
// TransportModeInfo — sin factor de emisión (ADR-002); las etiquetas son de los clientes (MODE_LABELS)
{ "mode": "BICYCLE", "max_speed_kmh": 50, "is_active": true }
// Feature<Zone> — respaldada por geo.mobility_zones (fuente única, también para la analítica)
{ "type": "Feature", "id": "uuid", "geometry": GeoJSONMultiPolygon,
  "properties": { "code": "QRO-CENTRO", "name": "Centro Histórico", "kind": "colonia",
                  "source": "INEGI-MGE-2020", "area_km2": 4.2 } }
```

| GET | 🆕 1.2 `/catalog/vehicle-types` | público | — | `200 VehicleTypeInfo[]` |

```jsonc
// 🆕 1.2 VehicleTypeInfo — sin factor (ADR-002); las etiquetas las ponen los clientes (VEHICLE_TYPE_LABELS)
{ "code": "SUV", "max_occupants": 7, "is_active": true }
```
`Preferences` gana `default_vehicle_type: VehicleType | null` (🆕 1.2).

## 9. 🆕 Gamificación

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/achievements` | público | — | `200 Achievement[]` (activos) |
| GET | `/gamification/me` | USER | — | `200 GamificationProfile` |
| GET | `/gamification/ranking` | USER | `period=week\|month\|all` (def. `week`) | `200 Ranking` |

`GET /users/me/achievements` (§3) devuelve el progreso del usuario en cada logro activo.

```jsonc
// Achievement
{ "id": "uuid", "code": "FIRST_TRIP", "name": "Primer viaje", "description": "...",
  "icon": "bicycle", "criterion": "TRIPS_COUNT", "threshold": 1, "bonus_points": 50,
  "is_active": true }
// UserAchievement
{ "achievement": Achievement, "awarded_at": "...|null", "progress": 1 }   // progress ≤ threshold
// GamificationProfile
{ "points_total": 1250, "level": 4, "level_points": 1000,      // puntos con los que empieza el nivel
  "next_level_points": 1500 }                                   // null en el nivel máximo
// Ranking — top 50 de la ciudad; solo usuarios con ranking_opt_in = true
{ "period": "week", "period_start": "...|null",
  "entries": [ { "position": 1, "display_name": "Ana L.", "points": 980, "is_me": false } ],
  "me": { "position": 37, "points": 210 } | null }              // null si el usuario no participa
```

Los logros los otorga el backend al crear, editar o generar viajes; cada logro nuevo crea una
notificación `ACHIEVEMENT_UNLOCKED` (§10). `display_name` lo genera el backend (primer nombre + inicial
del primer apellido); nunca se expone email ni nombre completo. Los niveles se calculan en el backend
(configuración versionada, como los factores).

## 10. 🆕 Notificaciones in-app — `/notifications`

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/notifications` | USER | `page, page_size, unread_only?` | `200 Paginated<Notification>` + `"unread_count": int` |
| POST | `/notifications/{notification_id}/read` | USER (dueño) | — | `204` · `404 NOTIFICATION_NOT_FOUND` |
| POST | `/notifications/read-all` | USER | — | `204` |

```jsonc
// Notification
{ "id": "uuid", "type": "ACHIEVEMENT_UNLOCKED", "title": "¡Nuevo logro!",
  "body": "Desbloqueaste «Primer viaje»", "data": { "achievement_code": "FIRST_TRIP" },
  "read_at": null, "created_at": "..." }
```

Las genera solo el backend. Se conservan 90 días. Push (Expo/FCM) queda fuera de 1.1.

## 11. 🆕 Reportes ciudadanos — `/citizen-reports`

| Método | Ruta | Rol | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/citizen-reports` | USER | `CitizenReportCreate` | `201 CitizenReport` (máx. 10 por usuario y día → `429 RATE_LIMITED`) |
| GET | `/citizen-reports/mine` | USER | `page, page_size` | `200 Paginated<CitizenReport>` |
| GET | `/admin/citizen-reports` | ADMIN | `page, page_size, status?, category?, from?, to?, bbox?` | `200 Paginated<CitizenReport>` |
| PATCH | `/admin/citizen-reports/{report_id}` | ADMIN | `{ "status": CitizenReportStatus, "resolution_note"?: str(≤1000) }` | `200 CitizenReport` · `404 CITIZEN_REPORT_NOT_FOUND` |

```jsonc
// CitizenReportCreate
{ "category": "BIKE_LANE_DAMAGE", "title": "str(3..120)", "description": "str(≤2000)",
  "location": GeoJSONPoint, "poi_id": "uuid|null" }     // location dentro del área de servicio
// CitizenReport
{ "id": "uuid", "category": "...", "status": "OPEN", "title": "...", "description": "...",
  "location": GeoJSONPoint, "poi_id": "uuid|null", "reporter_id": "uuid|null",
  "resolution_note": null, "created_at": "...", "updated_at": "..." }
```

El listado admin nunca expone email ni nombre del ciudadano; para contactarle, `GET /admin/users/{id}`
(auditado).

## 12. 🆕 Ruteo — `/routes`

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/routes` | USER | `origin=lng,lat`, `destination=lng,lat`, `mode` | `200 RouteResponse` · `400 BAD_REQUEST` · `422 TRIP_OUTSIDE_SERVICE_AREA` · `404 ROUTE_NOT_FOUND` · `503 ROUTING_UNAVAILABLE` |

```jsonc
// RouteResponse
{ "mode": "BICYCLE", "distance_m": 4830, "duration_s": 1140,
  "route": GeoJSONLineString,
  "route_token": "...",          // firma HMAC de (geometría, mode); caduca a las 24 h
  "provider": "osrm" }           // informativo
```

Motor de ruteo propio (OSRM) con perfiles `foot` (WALK), `bicycle` (BICYCLE, E_SCOOTER) y `car`
(BUS, CARPOOL, MOTORCYCLE, CAR). Los clientes nunca llaman a OSRM/Nominatim públicos (ARCHITECTURE §2).
Un viaje `PLANNED` debe enviar la `route` y el `route_token` tal cual los devolvió `/routes`.


### 12.1 🆕 1.2 Búsqueda de lugares — `/geocode` (observación O2)

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/geocode` | USER | `q` (2..120 caracteres), `limit?` (1..10, def. 5), `near?=lng,lat` | `200 { "items": Place[] }` · `429 RATE_LIMITED` · `503 GEOCODING_UNAVAILABLE` |

```jsonc
// Place
{ "name": "Universidad Politécnica de Querétaro", "label": "UPQ, El Marqués, Querétaro",
  "position": [-100.2526, 20.6551], "category": "university" | null,
  "source": "zone" | "poi" | "osm" } // 🆕 1.2.1 "zone": municipio o zona de geo.mobility_zones
```

El backend busca primero en zonas (municipios y colonias de `geo.mobility_zones`), luego en `pois` (nombre y alias, sin distinguir acentos) y completa con Nominatim
(OSM), limitado al área de servicio (`viewbox` + `bounded=1`), con caché de 24 h, como máximo 1 petición
por segundo hacia Nominatim (su política de uso) y un User-Agent genérico del proyecto. Límite por
usuario: 30 búsquedas por minuto. Los clientes nunca llaman a Nominatim directamente.

## 13. 🆕 Analítica — `/admin/analytics` (rol ADMIN)

### 13.1 Parámetros comunes

| Query | Tipo | Def. | Regla |
|---|---|---|---|
| `from`, `to` | fecha ISO | últimos 90 días | `from < to`, máx. 731 días → `400 DATE_RANGE_INVALID` / `DATE_RANGE_TOO_LARGE` |
| `mode` | `TransportMode`, repetible | todos | |
| `dataset` | `official` \| `demo` | `official` | Nunca se mezclan. `demo` lee solo datos sintéticos (`geo.demo_*`, zonas `source = DEMO`) |
| `bbox` | bbox | — | reglas de §0 |
| `cell_m` | metros | según ruta | 100–5000; > 200 000 celdas → `400 GRID_TOO_LARGE` |
| `kind` | `ZoneKind` | todas | filtro de tipo de zona |

Toda respuesta incluye `meta: AnalyticsMeta`:

```jsonc
{ "from": "2026-08-17T00:00:00Z", "to": "2026-11-15T00:00:00Z", "modes": null,
  "dataset": "official", "is_demo": false,
  "min_users": 5,          // k-anonimato aplicado (mínimo 3)
  "is_estimate": true,     // el CO₂ y sus derivados son estimaciones
  "bbox": null,            // bbox aplicado, si lo hay
  "notes": ["..."] }       // con dataset=demo incluye "DATOS DEMO SINTÉTICOS: ..."
```

**Privacidad:** ninguna celda, zona o flujo con menos de `min_users` usuarios distintos aparece en la
respuesta; el mapa de calor devuelve centroides de celda. Los indicadores de ciudad aplican el umbral
de `/stats/city` (≥ 10 viajes; si no, `suppressed: true` y ceros). Ninguna ruta devuelve trazas ni
`user_id`. **CO₂:** solo se suman los valores guardados por viaje (ADR-002); `avoided_g ≥ 0`.

### 13.2 Rutas

| Método | Ruta | Query extra | Respuesta |
|---|---|---|---|
| GET | `/admin/analytics/summary` | — | `AnalyticsSummary` |
| GET | `/admin/analytics/modes` | — | `{ items: ModeCo2Breakdown[], meta }` |
| GET | `/admin/analytics/peak-hours` | `by_weekday?=false` | `{ items: PeakHour[], suppressed, timezone, meta }` |
| GET | `/admin/analytics/timeseries` | `granularity` (def. `month`) | `AnalyticsTimeSeries` |
| GET | `/admin/analytics/users-growth` | `granularity` (def. `month`) | `UsersGrowth` |
| GET | `/admin/analytics/infrastructure` | `bbox?` (def. zona metropolitana) | `InfrastructureSummary` |
| GET | `/admin/analytics/co2-methodology` | — | `{ "assumptions": {...}, "units": {...}, "notes": [...], meta }` (sin factores) |
| GET | `/admin/analytics/zones` | `kind?` | `AnalyticsFeatureCollection<ZoneStats>` (MultiPolygon) |
| GET | `/admin/analytics/zones/{zone_id}/trips` | `relation=origin\|destination\|both\|any`, `page`, `page_size` | `Paginated<ZoneTrip> + meta` · `404 ZONE_NOT_FOUND` |
| GET | `/admin/analytics/od-flows` | `kind?`, `limit≤500` | `AnalyticsFeatureCollection<OdFlow>` (LineString) |
| GET | `/admin/analytics/grid` | `bbox`, `cell_m=500`, `metric=origin\|destination\|route`, `shape=hex\|square` | `AnalyticsFeatureCollection<GridCell>` (Polygon) |
| GET | `/admin/analytics/heatmap` | `bbox`, `cell_m=250`, `point=origin\|destination\|both` | `HeatmapResponse` (Point) |
| GET | `/admin/analytics/corridors` | `bbox`, `cell_m=300`, `quantile=0.9`, `min_cells=3` | `AnalyticsFeatureCollection<Corridor>` (Polygon/MultiPolygon) |
| GET | `/admin/analytics/bike-lane-coverage` | `buffer_m=15` | `{ buffer_m, items: BikeLaneCoverageItem[], meta }` |
| POST | `/admin/analytics/route-crossings` | `page`, `page_size` · body `{ geometry: GeoJSON, buffer_m: ≤500 }` | `Paginated<RouteCrossing> + meta` |
| GET | `/admin/analytics/route-overlap` | `trip_a`, `trip_b`, `tolerance_m=15` | `RouteOverlap` · `404 TRIP_NOT_FOUND` |
| GET | `/admin/analytics/distance` | `origin=lng,lat`, `destination=lng,lat` | `{ distance_m, method: "geodesic", meta }` |
| GET | `/admin/analytics/infrastructure-priority` | `bbox`, `infra=bike_lane\|bike_station\|bus_stop\|pedestrian`, `cell_m=500` | `PriorityResponse` |

### 13.3 Esquemas

```jsonc
// ModeCo2Breakdown — derivado solo de valores guardados por viaje
{ "mode": "BUS", "trips_count": 120, "users": 40, "share_of_trips": 0.23, "passenger_km": 610.2,
  "reference_car_g": 117158.4,  // co2_emitted_g + co2_saved_g
  "mode_g": 41493.6, "avoided_g": 75664.8, "per_passenger_km_g": 68.0 | null,
  "vehicle_g_estimate": null, "vehicle_occupancy_assumed": null, "clamped_trips": 0,
  "sensitivity": [ { "baseline_occupancy": 1.5, "avoided_g": 36612.0 } ] }
// AnalyticsSummary
{ "trips_count": 520, "active_users": 130, "distance_m": 2.1e6, "sustainable_trips": 470,
  "sustainable_distance_m": 1.9e6, "co2_emitted_g": 9.1e4, "co2_saved_g": 3.2e5,
  "co2": { "trips_count", "passenger_km", "reference_car_g", "mode_g", "avoided_g", "clamped_trips" } | null,
  "by_mode": ModeCo2Breakdown[], "suppressed": false, "meta": AnalyticsMeta }
// PeakHour            { "hour": 0..23, "weekday": 0..6 | null, "trips_count", "co2_saved_g" }
// AnalyticsTimeSeries { "granularity", "timezone": "America/Mexico_City", "suppressed",
//                       "points": [ { "period_start", "trips_count", "distance_m", "co2_saved_g", "active_users" } ], "meta" }
// UsersGrowth         { "granularity", "timezone",
//                       "points": [ { "period_start", "new_users", "total_users", "active_users" } ], "meta" }
// InfrastructureSummary { "pois_by_category": { PoiCategory: int }, "pois_inactive": int,
//                         "cycleways_length_m", "cycleways_protected_length_m", "meta" }   // meta.bbox = área usada
// AnalyticsFeatureCollection<P> = { "type": "FeatureCollection", "features": Feature<Geometry, P>[], "meta" }
// ZoneStats   { zone_id, zone_code, zone_name, zone_is_demo, area_km2, origins, destinations,
//               internal_trips, users, sustainable_distance_m, co2_saved_g, trip_ends_per_km2 }
// ZoneTrip    { trip_id, mode, source, started_at, distance_m, co2_saved_g, relation: "origin"|"destination"|"both" }
// OdFlow      { origin_zone_id, origin_zone_name, destination_zone_id, destination_zone_name,
//               trips_count, users, avg_distance_m }
// GridCell    { cell_i, cell_j, trips_count, users, co2_saved_g }
// HeatmapResponse = AnalyticsFeatureCollection<{ weight, users }> + { "cell_m", "max_weight" }
// Corridor    { corridor_id, cells, trips_count, users, max_cell_trips, span_m, elongation,
//               modes: { TransportMode: int } }
// BikeLaneCoverageItem { mode, trips_count, covered_share }     // fracción de la distancia a ≤ buffer_m de una ciclovía
// RouteCrossing { trip_id, mode, started_at, overlap_m }
// RouteOverlap  { trip_a, trip_b, tolerance_m, shared_m, share_a, share_b, meta }
// PriorityResponse = AnalyticsFeatureCollection<PriorityCell> + { infra, profile_label, config_version,
//                    components: [{ key, label, kind, weight }], notes: [] }
// PriorityCell { score: 0..100 | null, label: PriorityLabel, confidence: 0..1,
//                sample: { users, trip_ends }, demand_share,
//                components: [{ key, label, kind, raw, normalized, weight, contribution, available }],
//                explanation }
// PriorityLabel = "candidata_prioritaria_para_estudio" | "candidata_para_evaluar"
//               | "sin_senal_prioritaria" | "datos_insuficientes"   (nunca "necesita infraestructura")
```

Definición ejecutable de los campos: `apps/api/app/schemas/geo_analytics.py`; metodología en
`apps/api/docs/geo/`. Si hay discrepancia, manda este contrato y se corrige el schema.

---

## Anexo A — Permisos por rol (🆕, interno)

| Permiso | USER | ADMIN | SUPER_ADMIN |
|---|:-:|:-:|:-:|
| `profile:own`, `trips:own`, `stats:own`, `reports:citizen_create` | ✔ | ✔ | ✔ |
| `users:read`, `users:set_status` (solo sobre USER) | | ✔ | ✔ |
| `trips:read_any` (sin trazas), `trips:delete_any` | | ✔ | ✔ |
| `catalog:manage` (POIs, zonas, logros), `citizen_reports:manage` | | ✔ | ✔ |
| `stats:global`, `analytics:read`, `reports:export`, `emission_factors:read` | | ✔ | ✔ |
| `users:set_role`, `users:delete`, `users:set_status` sobre ADMIN | | | ✔ |
| `emission_factors:write`, `transport_modes:write`, `audit:read`, `reports:export_audit` | | | ✔ |

## Historial de cambios del contrato

| Versión | Fecha | Cambio | Aprobado por |
|---|---|---|---|
| 1.0.0 | 2026-11-15 | Contrato inicial | architect |
| 1.0.1 | 2026-11-15 | Aclaración: contraseña actual incorrecta en `/users/me/password` → 422, no 401. Sin cambios de forma | architect (propuesta backend) |
| 1.1.0 | 2026-11-16 | Sesiones, reset y verificación de correo, bloqueo; preferencias, exportación y borrado de cuenta; edición, viajes recurrentes, estimación por lotes y validaciones de viajes; `source` + `/routes`; puntos, logros y ranking; notificaciones; catálogos (medios, zonas); admin de viajes, zonas, logros y reportes CSV/PDF; reportes ciudadanos; analítica `/admin/analytics/*`. ⚠ `register` puede responder 202 con verificación obligatoria; el cambio de contraseña invalida los access | architect (propuestas backend rev. 4, geo, web, mobile ×3) |
| 1.1.1 | 2026-11-16 | §5.1: `code` de parada = código oficial (admin), único; la etiqueta `ref` de OSM va en `attributes.ref` (no única). Corrige el fallo de la migración con refs de OSM duplicados | architect |
| 1.2.0 | 2026-11-16 | Observaciones del usuario: `vehicle_type` y `occupants` en viajes y estimaciones (§4.3), `/catalog/vehicle-types` y `Preferences.default_vehicle_type` (§8), búsqueda de lugares `/geocode` (§12.1). Todo aditivo y opcional; sin cambios incompatibles | architect |
| 1.2.1 | 2026-11-16 | §12.1: `Place.source` admite `"zone"` (búsqueda de municipios y zonas) y el orden de búsqueda es zonas → POIs → Nominatim. Factor `SEDAN` = 174 g/km (EPA 2026, DATASETS.md); los viajes ya guardados conservan su factor | architect (propuesta backend + geo) |
| 1.2.2 | 2026-11-17 | Aclaraciones sin cambio de forma (QA Q12): cambiar el rol de un usuario revoca sus sesiones; en CAR/CARPOOL `emission_factor_g_per_km` es por persona | architect |
