# Base de datos — EcoMove Querétaro

> PostgreSQL 16 + PostGIS 3.4. Propiedad de la sesión **backend** (rol database). El esquema `geo`
> (funciones de análisis) es de la sesión **geo** y opera sobre estas tablas canónicas.
> Modelos: `apps/api/app/models/` · Migraciones: `apps/api/alembic/versions/`.

## 1. Reglas

- Todo cambio de esquema = migración Alembic (nunca `create_all` fuera de tests).
- Migraciones revisables: una por PR, nombre `AAAAMMDD_HHMM_<descripcion>.py`, con `downgrade`.
- PK `uuid` generadas en la aplicación (`uuid4`). Timestamps `timestamptz` en UTC.
- Geometrías SRID 4326 con índice GiST.
- Enums como tipos `ENUM` de PostgreSQL con los mismos valores que el contrato.
- Borrado lógico (`is_active`) para entidades administrativas (POIs); borrado físico para datos
  personales cuando el usuario lo solicita.

## 2. Diagrama entidad-relación

```
users 1───* trips
users 1───* refresh_tokens
users 1───* audit_logs (actor_id, nullable)
users 1───* emission_factors (updated_by, nullable)
pois        (independiente)
cycleways   (independiente)
```

## 3. Tablas

### `users`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| email | varchar(254) | único, se guarda en minúsculas |
| password_hash | varchar(255) | Argon2id |
| full_name | varchar(120) | |
| role | `user_role` | `USER`/`ADMIN`/`SUPER_ADMIN`, def. `USER` |
| is_active | boolean | def. `true` |
| failed_login_attempts | integer | def. 0; interno (bloqueo por fuerza bruta) |
| locked_until | timestamptz null | interno; bloqueo temporal tras 5 fallos |
| last_login_at | timestamptz null | interno |
| created_at, updated_at | timestamptz | |

Restricciones: `CHECK (email = lower(email))`. Índice `(role, is_active)`.

### `roles`, `permissions`, `role_permissions` (RBAC interno)
| Tabla | Columnas | Notas |
|---|---|---|
| roles | `name user_role` PK, `description`, `level smallint` | USER=1, ADMIN=2, SUPER_ADMIN=3 |
| permissions | `code varchar(64)` PK, `description` | p. ej. `users:set_role` |
| role_permissions | `(role, permission_code)` PK, FK a ambas con CASCADE | semilla en la migración `0002` |

La API sigue exponiendo `role` como string; cada endpoint exige un permiso que se lee de estas
tablas en cada petición (`app/core/deps.py::require_permission`).

### `refresh_tokens`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = `jti` del token |
| user_id | uuid FK→users ON DELETE CASCADE | índice |
| family_id | uuid | índice; rotación |
| token_hash | char(64) | SHA-256 hex, único |
| expires_at | timestamptz | |
| revoked_at | timestamptz null | |
| replaced_by_id | uuid null | |
| created_at | timestamptz | |

### `trips`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users ON DELETE CASCADE | |
| client_trip_id | uuid | único por `(user_id, client_trip_id)` — idempotencia |
| mode | `transport_mode` | |
| status | `trip_status` | def. `COMPLETED` |
| started_at, ended_at | timestamptz | `CHECK (ended_at > started_at)` |
| distance_m | double precision | calculada: `ST_Length(route::geography)` |
| duration_s | integer | calculada |
| route | geometry(LineString, 4326) | índice GiST |
| emission_factor_g_per_km | double precision | factor aplicado (histórico) |
| co2_emitted_g, co2_saved_g | double precision | `CHECK (>= 0)` |
| created_at | timestamptz | |

Índices: `(user_id, started_at DESC)`, `(started_at)`, GiST `(route)`.

### `emission_factors`
| Columna | Tipo | Notas |
|---|---|---|
| mode | `transport_mode` PK | un factor vigente por modo |
| grams_per_km | double precision | `CHECK (>= 0)` |
| valid_from | timestamptz | |
| updated_by | uuid FK→users null | |

### `pois`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | varchar(160) | |
| category | `poi_category` | |
| description | text null | |
| attributes | jsonb | def. `{}` |
| location | geometry(Point, 4326) | GiST |
| is_active | boolean | |
| created_at, updated_at | timestamptz | |

### `cycleways`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | varchar(160) null | |
| is_protected | boolean | |
| osm_id | bigint null | único; para importaciones de OSM |
| geom | geometry(LineString, 4326) | GiST |
| created_at | timestamptz | |

`length_m` del contrato se calcula en consulta: `ST_Length(geom::geography)`.

### `audit_logs`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| actor_id | uuid FK→users ON DELETE SET NULL | |
| action | varchar(64) | p. ej. `USER_ROLE_CHANGED` |
| entity_type | varchar(32) | |
| entity_id | uuid null | |
| payload | jsonb | sin secretos |
| created_at | timestamptz | índice |

## 4. Datos semilla — factores de emisión (g CO₂/km por pasajero)

| Modo | g/km | Fuente orientativa |
|---|---|---|
| WALK | 0 | — |
| BICYCLE | 0 | — |
| E_SCOOTER | 25 | ciclo de vida, red eléctrica MX |
| BUS | 68 | autobús urbano diésel, ocupación media |
| CARPOOL | 64 | automóvil / 3 ocupantes |
| MOTORCYCLE | 103 | |
| CAR | 192 | automóvil gasolina, 1 ocupante (línea base) |

> Valores iniciales para desarrollo; el SUPER_ADMIN los ajusta con datos oficiales (SEMARNAT/INECC).

## 5. Consultas clave

```sql
-- POIs en bbox
SELECT ... FROM pois
WHERE is_active AND location && ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
LIMIT :limit;

-- Distancia de una traza
SELECT ST_Length(ST_GeomFromGeoJSON(:geojson)::geography);
```

## 6. Operación

- Desarrollo: `infrastructure/docker-compose.yml` (volumen `ecomove_pgdata`).
- La extensión `postgis` se crea en `infrastructure/postgres/init/01-extensions.sql` y también en la
  migración inicial (idempotente).
- Respaldos (producción): `pg_dump` diario + WAL; retención 30 días.
