# Funciones de cuenta, viajes, catálogos y administración (contrato 1.1.0)
- **Autor (agente):** backend
- **Estado:** Aprobada por el architect (rev. 4, 2026-11-16) para el contrato 1.1.0. Decisiones: CRUD admin sin prefijo `catalog`; zonas sobre `geo.mobility_zones`; estaciones como POIs; `transport_modes` mínima y sin factor público; código `MODE_INACTIVE`; contraseña actual incorrecta → 422 (ya en 1.0.1).
- **Afecta a:** API_CONTRACT §0, §2, §3, §4, §7 y secciones nuevas §9 `/catalog`, §10 `/achievements`; apps/api; DATABASE.md §3; SECURITY.md §1; packages/shared; apps/web; apps/mobile
- **Unifica:** la parte (a) de `2026-11-15-mobile-password-reset-notifications.md` (recuperación de contraseña), con sus rutas y códigos de error. La parte (b) de esa propuesta (notificaciones) **no** forma parte de esta propuesta y sigue su propio curso.

## Motivación

El encargo del backend incluye funciones que el contrato 1.0.0 no tiene: verificación de correo,
recuperación de contraseña, gestión de sesiones, protección contra fuerza bruta, preferencias,
historial y estadísticas, exportación y borrado de cuenta, edición de viajes, viajes recurrentes,
detección de duplicados, catálogos (medios de transporte, estaciones, zonas, logros), gestión de
viajes por administradores, reportes exportables y RBAC con permisos.

Las rutas 1.0.0 no cambian. Todo lo de esta propuesta es **aditivo**, salvo los dos cambios de
comportamiento marcados con ⚠.

## Cambio propuesto

### 0. Convenciones (§0): códigos de error nuevos

| HTTP | `code` |
|---|---|
| 400 | `RESET_TOKEN_INVALID`, `VERIFICATION_TOKEN_INVALID` |
| 403 | `EMAIL_NOT_VERIFIED` (solo si `REQUIRE_EMAIL_VERIFICATION=true`, ver §2.2) |
| 404 | `SESSION_NOT_FOUND`, `ZONE_NOT_FOUND`, `ACHIEVEMENT_NOT_FOUND`, `REPORT_NOT_FOUND` |
| 409 | `TRIP_DUPLICATE` |
| 422 | `TRIP_OUTSIDE_SERVICE_AREA`, `TRIP_IMPLAUSIBLE_SPEED`, `TRIP_TOO_SHORT`, `MODE_INACTIVE` |
| 429 | `RATE_LIMITED` (ya existe; ahora también lo produce el bloqueo de cuenta, con cabecera `Retry-After`) |

### 1. Seguridad sin cambios de rutas

- Hash **Argon2id** (`argon2-cffi`, parámetros por defecto de `PasswordHasher`). Ya aprobado por el architect.
- **Bloqueo por cuenta:** 5 contraseñas incorrectas seguidas → 15 min de bloqueo. Durante el bloqueo,
  `POST /auth/login` responde `429 RATE_LIMITED` con `Retry-After`. Para no revelar si el email
  existe, también hay un límite por email (10 intentos / 15 min) que se aplica igual a emails
  inexistentes.
- **Rate limiting:** `/auth/*` 10 req/min/IP; resto 120 req/min/usuario o IP (SECURITY.md §3), ya en etapa 1.
- **Permisos:** la API sigue exponiendo `role` como `USER | ADMIN | SUPER_ADMIN`. Internamente, las
  tablas `roles`, `permissions` y `role_permissions` (§DATABASE abajo) definen qué puede hacer cada
  rol, y cada endpoint exige un permiso concreto. Tabla de permisos en el anexo A.

### 2. Autenticación — `/auth` (añadidos)

| Método | Ruta | Rol | Body | Respuesta |
|---|---|---|---|---|
| POST | `/auth/password-reset/request` | público | `{ "email": str }` | `202 { "message": str }` **siempre** |
| POST | `/auth/password-reset/confirm` | público | `{ "token": str, "new_password": Password }` | `204`; revoca todos los refresh · `400 RESET_TOKEN_INVALID` |
| POST | `/auth/email-verification/request` | público | `{ "email": str }` | `202 { "message": str }` **siempre** |
| POST | `/auth/email-verification/confirm` | público | `{ "token": str }` | `204` · `400 VERIFICATION_TOKEN_INVALID` |
| POST | `/auth/logout-all` | USER | — | `204`; revoca todos los refresh y los access ya emitidos |
| GET | `/auth/sessions` | USER | — | `200 Session[]` |
| DELETE | `/auth/sessions/{session_id}` | USER (dueño) | — | `204` · `404 SESSION_NOT_FOUND` (también si es de otro usuario) |

```jsonc
// Session (una por familia de refresh tokens = un dispositivo)
{ "id": "uuid", "created_at": "...", "last_used_at": "...", "expires_at": "...",
  "user_agent": "okhttp/4.12 | Mozilla/5.0 ...|null", "current": true }
```

2.1 Tokens de un solo uso: aleatorios (≥ 256 bits), guardados solo como hash SHA-256, de un solo
uso, reset 30 min, verificación 48 h. Pedir uno nuevo invalida el anterior. Enlaces:
`ecomove://reset-password?token=…` / `<WEB_URL>/restablecer-contrasena?token=…` y
`ecomove://verify-email?token=…` / `<WEB_URL>/verificar-correo?token=…`. Rate limit por IP y por email.

2.2 ⚠ `POST /auth/register` sigue respondiendo `201 TokenPair` y envía el correo de verificación.
Con `REQUIRE_EMAIL_VERIFICATION=false` (valor por defecto) se puede usar la cuenta sin verificar.
Con `true` (producción, si se decide), `login` y `refresh` de una cuenta sin verificar responden
`403 EMAIL_NOT_VERIFIED` y `register` responde `202 { "message" }` sin tokens.

2.3 ⚠ `POST /users/me/password` además invalida los access tokens ya emitidos (no solo los refresh).

### 3. Usuarios — `/users` (añadidos)

| Método | Ruta | Rol | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/users/me/preferences` | USER | — | `200 Preferences` |
| PUT | `/users/me/preferences` | USER | `Preferences` | `200 Preferences` |
| GET | `/users/me/achievements` | USER | — | `200 UserAchievement[]` |
| GET | `/users/me/export` | USER | — | `200 UserExport` (descarga `Content-Disposition: attachment`) |
| DELETE | `/users/me` | USER | `{ "password": str }` | `204`; borrado físico. `403 FORBIDDEN` si es el último SUPER_ADMIN activo |

`User` gana el campo `"email_verified": bool`.

```jsonc
// Preferences (todos con valor por defecto)
{ "language": "es" | "en", "default_mode": TransportMode | null,
  "weekly_goal_trips": 1..100 | null, "email_notifications": true }
// UserExport (LFPDPPP, derecho de acceso)
{ "exported_at": "...", "user": User, "preferences": Preferences,
  "trips": Trip[],                       // con trazas completas
  "achievements": UserAchievement[], "stats": StatsSummary }
```

Borrado de cuenta: elimina usuario, viajes (trazas), tokens, logros y preferencias. En `audit_logs`,
`actor_id` pasa a `null` (FK `ON DELETE SET NULL`); se registra `USER_SELF_DELETED` sin email.
El historial de viajes es `GET /trips` (ya existe); las estadísticas, `GET /stats/me` (ya existe).

### 4. Viajes — `/trips` (añadidos y validaciones)

| Método | Ruta | Rol | Body | Respuesta |
|---|---|---|---|---|
| PATCH | `/trips/{trip_id}` | USER (dueño) | `TripUpdate` | `200 Trip` · `404 TRIP_NOT_FOUND` |
| POST | `/trips/recurring` | USER | `RecurringTripCreate` | `201 RecurringTripResult` |

```jsonc
// TripUpdate (todos opcionales). Recalcula distancia, duración y CO₂.
{ "mode": TransportMode, "status": TripStatus, "started_at": "...", "ended_at": "...",
  "route": GeoJSONLineString }
// RecurringTripCreate: genera un viaje por cada día marcado del rango, solo fechas pasadas.
{ "mode": "BICYCLE", "route": GeoJSONLineString,
  "start_date": "2026-10-01", "end_date": "2026-11-14",   // máx. 366 días, end_date <= hoy
  "weekdays": [0, 1, 2, 3, 4],                            // 0 = lunes … 6 = domingo
  "departure_time": "08:00", "duration_s": 1200,          // 60..86400
  "utc_offset_minutes": -360 }                            // Querétaro: UTC-6
// RecurringTripResult
{ "recurrence_id": "uuid", "created": 30, "skipped_duplicates": 2, "trip_ids": ["uuid", ...] }
```

`Trip` y `TripSummary` ganan `"recurrence_id": "uuid|null"`. La zona de origen y destino no se
guarda en el viaje: la calcula la analítica geo con `ST_Within` contra `geo.mobility_zones`.

Validaciones nuevas en `POST /trips`, `PATCH /trips/{id}` y `/trips/recurring` (también en `/trips/estimate` las de ruta):
- Toda la ruta dentro del área de servicio (bbox configurable del estado de Querétaro) → `422 TRIP_OUTSIDE_SERVICE_AREA`.
- Distancia ≥ 50 m → `422 TRIP_TOO_SHORT`.
- Velocidad media ≤ máximo del medio (`transport_modes.max_speed_kmh`) → `422 TRIP_IMPLAUSIBLE_SPEED`.
- Duración ≤ 24 h → `422 VALIDATION_ERROR`.
- Duplicado: mismo usuario y medio con intervalo `[started_at, ended_at]` que se solapa con otro viaje
  `COMPLETED` → `409 TRIP_DUPLICATE` (`details.trip_id` = viaje existente). Reintentos con el mismo
  `client_trip_id` siguen respondiendo `200` (idempotencia 1.0.0, sin cambios). En `/trips/recurring` los
  duplicados se omiten y se cuentan en `skipped_duplicates`.

### 5. Estadísticas — `/stats`

Sin cambios.

### 7. Administración — `/admin` (añadidos)

| Método | Ruta | Rol | Body / Query | Respuesta |
|---|---|---|---|---|
| PATCH | `/admin/users/{user_id}/status` | ADMIN | `{ "is_active": bool, "reason"?: str(5..500) }` | sin cambios; `reason` se guarda en el AuditLog |
| DELETE | `/admin/users/{user_id}` | SUPER_ADMIN | `{ "reason": str(5..500) }` | `204` (mismas reglas: no a sí mismo, ≥ 1 SUPER_ADMIN activo) |
| GET | `/admin/trips` | ADMIN | `page, page_size, user_id?, mode?, status?, from?, to?` | `200 Paginated<AdminTripSummary>` |
| DELETE | `/admin/trips/{trip_id}` | ADMIN | `{ "reason": str(5..500) }` | `204` |
| GET | `/admin/reports` | ADMIN | `page, page_size` | `200 Paginated<Report>` |
| POST | `/admin/reports` | ADMIN | `ReportCreate` | `201 Report` |
| GET | `/admin/reports/{report_id}/download` | ADMIN | — | `200 text/csv` · `404 REPORT_NOT_FOUND` |
| POST | `/admin/zones` | ADMIN | `ZoneCreate` | `201 Feature<Zone>` |
| PATCH | `/admin/zones/{zone_id}` | ADMIN | `ZoneUpdate` | `200 Feature<Zone>` |
| DELETE | `/admin/zones/{zone_id}` | ADMIN | — | `204` (borrado físico; las zonas no tienen datos personales) |
| PATCH | `/admin/transport-modes/{mode}` | SUPER_ADMIN | `{ "max_speed_kmh"?: number(0..300], "is_active"?: bool }` | `200 TransportModeInfo` |

Todas las mutaciones de zonas y medios de transporte escriben un AuditLog. `DELETE /admin/zones/{id}`
guarda en el payload `{ code, name, kind, source, area_km2, bbox: [minLng, minLat, maxLng, maxLat] }`
(sin la geometría completa).
| POST | `/admin/achievements` | ADMIN | `AchievementCreate` | `201 Achievement` |
| PATCH | `/admin/achievements/{achievement_id}` | ADMIN | `AchievementUpdate` | `200 Achievement` |

```jsonc
// AdminTripSummary = TripSummary + { "user_id": "uuid" }   — NUNCA la traza (SECURITY.md §5)
// ReportCreate
{ "report_type": "trips" | "users" | "co2_by_mode" | "co2_by_zone",
  "from": "...|null", "to": "...|null" }
// Report
{ "id": "uuid", "report_type": "trips", "parameters": { "from": null, "to": null },
  "row_count": 120, "created_by": "uuid|null", "created_at": "..." }
```

Contenido de los CSV: `trips` = id, user_id, mode, status, started_at, ended_at, distance_m,
duration_s, co2_emitted_g, co2_saved_g (sin trazas ni coordenadas); `users` = id, role, is_active,
email_verified, created_at, trips_count (sin email ni nombre); `co2_by_mode` y `co2_by_zone` = agregados.
Las celdas que empiezan con `= + - @` se escapan (inyección CSV). La generación es síncrona, con un
máximo de 100 000 filas; cada creación y descarga escribe un AuditLog.

### 9. Catálogos — `/catalog` (nuevo, público)

| Método | Ruta | Rol | Query | Respuesta |
|---|---|---|---|---|
| GET | `/catalog/transport-modes` | público | — | `200 TransportModeInfo[]` |
| GET | `/catalog/zones` | público | `bbox?`, `kind?` | `200 FeatureCollection<Zone>` (sin zonas DEMO) |

```jsonc
// TransportModeInfo — las etiquetas visibles son de los clientes (MODE_LABELS en shared).
// Sin factor de emisión (ADR-002): los clientes usan POST /trips/estimate; los admins, /admin/emission-factors.
{ "mode": "BICYCLE", "max_speed_kmh": 50, "is_active": true }
// Feature<Zone> — respaldada por geo.mobility_zones (una sola fuente; la usa también la analítica geo)
{ "type": "Feature", "id": "uuid", "geometry": GeoJSONMultiPolygon,
  "properties": { "code": "QRO-CENTRO", "name": "Centro Histórico",
                  "kind": "colonia" | "ageb" | "municipio" | "distrito" | "custom",
                  "source": "INEGI-MGE-2020", "area_km2": 4.2 } }
// ZoneCreate: { "code": "^[A-Z0-9_-]{2,32}$", "name": str(2..120), "kind": ZoneKind, "source": str(2..80),
//               "geometry": GeoJSONPolygon | GeoJSONMultiPolygon }   — se valida con ST_IsValid y se
//               normaliza a MultiPolygon. `source` = "DEMO" no se acepta por la API.
// ZoneUpdate: ZoneCreate con todos los campos opcionales (salvo code, inmutable)
```

Validaciones de zonas (acordadas con geo; una geometría inválida rompe `trips_by_zone`, `od_flows` y `trips_in_zone`):
- `geometry` válida (`ST_IsValid`), con área > 0; un `Polygon` se convierte a `MultiPolygon` con `ST_Multi`. Si no → `422 VALIDATION_ERROR` (`loc: ["body","geometry"]`).
- `kind` ∈ `colonia | ageb | municipio | distrito | custom` (CHECK de la tabla); `code` único → `409 CONFLICT` si se repite.
- `source` obligatorio, de 2 a 80 caracteres, con formato de fuente citable `^[A-Za-z0-9][A-Za-z0-9 ._:/-]+$` (p. ej. `INEGI-MGE-2020`, `municipio:2026-05`); `DEMO` está prohibido.
- Las zonas del mismo `kind` pueden superponerse; un viaje cuenta en ambas. No se bloquea, la web puede advertirlo.

Medio inactivo: `POST /trips`, `PATCH /trips/{id}`, `/trips/recurring` y `/trips/estimate` responden
`422 MODE_INACTIVE` (`details: { "mode": "E_SCOOTER" }`). Es un código propio para que mobile, que
graba sin conexión, avise al usuario y conserve el viaje en local en vez de tratarlo como error de
formato. Los viajes ya registrados no cambian. Los reintentos idempotentes de un `client_trip_id` que
ya existía siguen respondiendo `200` aunque el medio se haya desactivado después.

### 9.1 Estaciones de transporte = POIs (sin entidad nueva)

Las paradas y estaciones son POIs con categoría `BUS_STOP`, `BIKE_SHARING` o `BIKE_PARKING`. Se
administran con `/admin/map/pois` y se leen con `/map/pois?category=BUS_STOP` (ya en 1.0.0). Para las
paradas formales, `attributes` admite de forma convencional:

```jsonc
{ "code": "QB-001", "lines": ["L1", "L2"] }   // code: ^[A-Z0-9_-]{2,32}$ · lines: ≤ 50 strings de ≤ 32
```

El backend valida esos dos campos cuando están presentes y garantiza `code` único entre paradas con
un índice único parcial: `UNIQUE ((attributes->>'code')) WHERE category IN ('BUS_STOP','BIKE_SHARING','BIKE_PARKING') AND attributes ? 'code'`.
Un `code` repetido → `409 CONFLICT`. La zona de cada parada no se guarda (se calcula con `ST_Within`).

## 10. Logros — `/achievements` (nuevo)

| Método | Ruta | Rol | Respuesta |
|---|---|---|---|
| GET | `/achievements` | público | `200 Achievement[]` (activos) |

```jsonc
// Achievement
{ "id": "uuid", "code": "FIRST_TRIP", "name": "Primer viaje", "description": "...",
  "criterion": "TRIPS_COUNT" | "DISTANCE_M" | "CO2_SAVED_G" | "DISTINCT_MODES",
  "threshold": 1, "is_active": true }
// UserAchievement
{ "achievement": Achievement, "awarded_at": "..." }
```

Los logros se otorgan en el backend al crear, editar o generar viajes. `POST /trips` no cambia su
respuesta; el cliente consulta `GET /users/me/achievements`. Si se aprueba la propuesta de
notificaciones de mobile, cada logro nuevo generará una `ACHIEVEMENT_UNLOCKED`. Esta propuesta
cubre la parte de logros de `2026-11-15-mobile-gamification.md` en lo que coincidan; los puntos y el
ranking quedan en esa propuesta.

## Base de datos (DATABASE.md §3)

| Tabla | Cambio |
|---|---|
| `users` | + `email_verified_at timestamptz null`, `failed_login_attempts int def 0`, `locked_until timestamptz null`, `token_version int def 0`, `last_login_at timestamptz null`, `preferences jsonb def '{}'` |
| `refresh_tokens` | + `last_used_at`, `user_agent varchar(255) null` |
| `roles` | nueva: `name user_role PK`, `description`, `level smallint` |
| `permissions` | nueva: `code varchar(64) PK`, `description` |
| `role_permissions` | nueva: `(role, permission_code)` PK |
| `user_tokens` | nueva: `id`, `user_id` FK CASCADE, `purpose` (`PASSWORD_RESET`/`EMAIL_VERIFICATION`), `token_hash char(64)` único, `expires_at`, `used_at`, `created_at` |
| `transport_modes` | nueva: `mode transport_mode PK`, `max_speed_kmh double precision CHECK (> 0 AND <= 300)`, `is_active boolean`. Semilla con los 7 modos. Sin `name`. Los factores siguen en `emission_factors` |
| `geo.mobility_zones` | existente (migración 0003). Sin tabla `public.zones` |
| `pois` | + índice único parcial sobre `(attributes->>'code')` para paradas (§9.1). Sin tabla `stations` |
| `trips` | + `recurrence_id uuid null` (índice), `updated_at` |
| `achievements` | nueva: `id`, `code` único, `name`, `description`, `criterion`, `threshold > 0`, `is_active` |
| `user_achievements` | nueva: `id`, `user_id` FK CASCADE, `achievement_id` FK CASCADE, `awarded_at`, único `(user_id, achievement_id)` |
| `reports` | nueva: `id`, `report_type`, `parameters jsonb`, `row_count`, `content text`, `created_by` FK SET NULL, `created_at` |
| `audit_logs` | + `ip_address inet null`, `request_id varchar(64) null`; índices `(actor_id, created_at)`, `(action)` |

`password_reset_tokens` de la propuesta mobile se cubre con `user_tokens`.

## Anexo A — Permisos por rol

| Permiso | USER | ADMIN | SUPER_ADMIN |
|---|:-:|:-:|:-:|
| `profile:own`, `trips:own`, `stats:own` | ✔ | ✔ | ✔ |
| `users:read`, `users:set_status` (solo sobre USER) | | ✔ | ✔ |
| `trips:read_any` (sin trazas), `trips:delete_any` | | ✔ | ✔ |
| `catalog:manage` (POIs, zonas, logros) | | ✔ | ✔ |
| `stats:global`, `reports:export`, `emission_factors:read` | | ✔ | ✔ |
| `users:set_role`, `users:delete`, `users:set_status` sobre ADMIN | | | ✔ |
| `emission_factors:write`, `transport_modes:write`, `audit:read` | | | ✔ |

## Impacto en otros agentes

- **architect:** contrato 1.1.0, historial §8, SECURITY.md §1 (Argon2id, bloqueo), DATABASE.md §3.
- **shared:** tipos `Session`, `Preferences`, `UserExport`, `TripUpdate`, `RecurringTripCreate`,
  `RecurringTripResult`, `AdminTripSummary`, `Report`, `ReportCreate`, `TransportModeInfo`, `Zone`,
  `ZoneKind`, `Achievement`, `UserAchievement`, códigos de error nuevos; `User.email_verified`.
- **web:** páginas de restablecer contraseña y verificar correo; sesiones, preferencias, exportar y
  borrar cuenta; panel admin de viajes, reportes, zonas, medios de transporte y logros; las estaciones se gestionan como POIs.
- **mobile:** pantalla de recuperar contraseña (deja de ser placeholder), deep links, sesiones, viajes recurrentes.
- **geoespacial:** la API escribe en `geo.mobility_zones` (CRUD `/admin/zones`); las estaciones siguen llegando a `geo.v_stations` desde `pois`.
- **devops:** variables nuevas `SMTP_*`, `EMAIL_FROM`, `WEB_URL`, `REQUIRE_EMAIL_VERIFICATION`; Mailpit en compose para desarrollo.

## Alternativas consideradas

- Roles solo como enum, con permisos en código: más simple, pero el encargo pide tablas de roles y permisos.
- Tabla `stations` propia: rechazada por el architect (duplicaba `pois`); `code` y `lines` van en `pois.attributes`.
- Tabla `public.zones`: descartada; duplicaría `geo.mobility_zones`.
- Reportes asíncronos con worker: innecesario con el volumen actual; se puede añadir sin cambiar el contrato.
