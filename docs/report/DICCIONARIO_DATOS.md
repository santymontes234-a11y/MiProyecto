# Diccionario de datos de EcoMove Querétaro

> Generado desde el catálogo de PostgreSQL (`COMMENT ON` y `pg_constraint`) de una BD creada con
> `database/01_esquema.sql` (migraciones Alembic 0001–0010).
> Los comentarios salen de `apps/api/app/models/comments.py`.

Convenciones:

- PK = clave primaria, FK = clave foránea y UQ = única.
- Las fechas son `timestamptz` (UTC).
- Las geometrías usan SRID 4326, salvo que se indique otro.

Total: **25 tablas** (23 en `public` y 2 en `geo`).

## Índice

- [`public.achievements`](#publicachievements): Catálogo de logros de gamificación
- [`public.audit_logs`](#publicaudit_logs): Bitácora de auditoría de operaciones administrativas (append-only)
- [`public.bike_stations`](#publicbike_stations): Subtipo de pois: estaciones y estacionamientos de bicicleta
- [`public.citizen_reports`](#publiccitizen_reports): Reportes ciudadanos sobre infraestructura y seguridad
- [`public.cycleways`](#publiccycleways): Ciclovías (OpenStreetMap, ODbL)
- [`public.emission_factors`](#publicemission_factors): Factores de emisión vigentes por medio de transporte (g CO2/km por pasajero)
- [`public.notifications`](#publicnotifications): Notificaciones in-app; se conservan 90 días
- [`public.permissions`](#publicpermissions): Catálogo de permisos atómicos RBAC
- [`public.pois`](#publicpois): Puntos de interés (supertipo de la especialización EER disjunta y parcial)
- [`public.refresh_tokens`](#publicrefresh_tokens): Refresh tokens rotativos; cada familia es una sesión (dispositivo). Solo se guarda el hash
- [`public.reports`](#publicreports): Informes administrativos generados (CSV/PDF), sin datos personales
- [`public.role_permissions`](#publicrole_permissions): Relación N:M entre roles y permisos
- [`public.roles`](#publicroles): Catálogo de roles RBAC
- [`public.stop_lines`](#publicstop_lines): Relación N:M entre paradas y líneas
- [`public.transit_lines`](#publictransit_lines): Líneas de transporte público
- [`public.transit_stops`](#publictransit_stops): Subtipo de pois: paradas de autobús (category = BUS_STOP)
- [`public.transport_modes`](#publictransport_modes): Configuración por medio de transporte (sin factor ni etiqueta)
- [`public.trips`](#publictrips): Viajes registrados. La distancia, el CO2 y los puntos los calcula solo el servidor
- [`public.user_achievements`](#publicuser_achievements): Logros obtenidos por cada usuario (N:M users–achievements)
- [`public.user_preferences`](#publicuser_preferences): Preferencias del usuario (1:1 con users; normalización del antiguo JSONB)
- [`public.user_tokens`](#publicuser_tokens): Tokens de un solo uso para restablecer contraseña y verificar correo (solo hash)
- [`public.users`](#publicusers): Cuentas de usuario. Datos personales mínimos (LFPDPPP); la contraseña solo como hash Argon2id
- [`public.vehicle_types`](#publicvehicle_types): Tipos de automóvil y su factor de emisión por vehículo, con fuente citada (APA)
- [`geo.mobility_zones`](#geomobility_zones): Zonas de análisis (municipios y AGEB del INEGI, zonas de ADMIN y zonas DEMO)
- [`geo.zone_census`](#geozone_census): Población y vivienda del Censo 2020 (INEGI) por zona

<a id="publicachievements"></a>
## `public.achievements`

Catálogo de logros de gamificación

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `code` | character varying(40) | NO |  | UQ | Código único en mayúsculas, p. ej. FIRST_TRIP |
| 3 | `name` | character varying(80) | NO |  |  | Nombre visible del logro |
| 4 | `description` | character varying(300) | NO |  |  | Descripción del logro |
| 5 | `icon` | character varying(40) | NO |  |  | Nombre del icono que muestran los clientes |
| 6 | `criterion` | achievement_criterion | NO |  |  | Métrica evaluada: TRIPS_COUNT, DISTANCE_M, CO2_SAVED_G, DISTINCT_MODES |
| 7 | `threshold` | double precision | NO |  |  | Valor que hay que alcanzar (> 0) |
| 8 | `bonus_points` | integer | NO | `0` |  | Puntos extra al obtenerlo (0–10000) |
| 9 | `is_active` | boolean | NO | `true` |  | Falso = el logro ya no se otorga ni se muestra |
| 10 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |
| 11 | `updated_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de la última modificación (UTC) |

Restricciones CHECK:

- `ck_achievements_bonus_range`: `CHECK (((bonus_points >= 0) AND (bonus_points <= 10000)))`
- `ck_achievements_code_format`: `CHECK (((code)::text ~ '^[A-Z0-9_]{2,40}$'::text))`
- `ck_achievements_threshold_positive`: `CHECK ((threshold > (0)::double precision))`

<a id="publicaudit_logs"></a>
## `public.audit_logs`

Bitácora de auditoría de operaciones administrativas (append-only)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `actor_id` | uuid | SÍ |  | FK → public.users(id) | Usuario que realizó la acción (FK a users.id; NULL si se borró) |
| 3 | `action` | character varying(64) | NO |  |  | Acción en mayúsculas, p. ej. USER_ROLE_CHANGED |
| 4 | `entity_type` | character varying(32) | NO |  |  | Tipo de entidad afectada |
| 5 | `entity_id` | uuid | SÍ |  |  | Identificador de la entidad afectada |
| 6 | `payload` | jsonb | NO | `'{}'::jsonb` |  | Detalle redactado (sin secretos ni coordenadas); JSONB justificado |
| 7 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |

<a id="publicbike_stations"></a>
## `public.bike_stations`

Subtipo de pois: estaciones y estacionamientos de bicicleta

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `poi_id` | uuid | NO |  | PK, FK → public.pois(id,category) | PK y FK compuesta (poi_id, category) a pois |
| 2 | `category` | poi_category | NO |  | FK → public.pois(id,category) | BIKE_SHARING o BIKE_PARKING (garantiza la disyunción) |
| 3 | `code` | character varying(32) | SÍ |  | UQ | Código oficial de la estación (único, opcional) |
| 4 | `capacity` | integer | SÍ |  |  | Número de lugares (1–10000, opcional) |

Restricciones CHECK:

- `ck_bike_stations_capacity`: `CHECK (((capacity IS NULL) OR ((capacity >= 1) AND (capacity <= 10000))))`
- `ck_bike_stations_category`: `CHECK ((category = ANY (ARRAY['BIKE_SHARING'::poi_category, 'BIKE_PARKING'::poi_category])))`
- `ck_bike_stations_code_format`: `CHECK (((code)::text ~ '^[A-Z0-9_-]{2,32}$'::text))`

<a id="publiccitizen_reports"></a>
## `public.citizen_reports`

Reportes ciudadanos sobre infraestructura y seguridad

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `reporter_id` | uuid | SÍ |  | FK → public.users(id) | Ciudadano que reporta (FK a users.id; NULL si borró su cuenta) |
| 3 | `category` | citizen_report_category | NO |  |  | BIKE_LANE_DAMAGE, MISSING_INFRASTRUCTURE, SAFETY, POI_ISSUE u OTHER |
| 4 | `status` | citizen_report_status | NO | `'OPEN'::citizen_report_status` |  | OPEN, IN_REVIEW, RESOLVED o REJECTED |
| 5 | `title` | character varying(120) | NO |  |  | Título (3–120) |
| 6 | `description` | text | NO |  |  | Descripción (máx. 2000) |
| 7 | `location` | geometry(Point,4326) | NO |  |  | Ubicación del problema: Point SRID 4326 |
| 8 | `poi_id` | uuid | SÍ |  | FK → public.pois(id) | Punto de interés relacionado (FK a pois.id, opcional) |
| 9 | `resolution_note` | character varying(1000) | SÍ |  |  | Nota del administrador al resolver |
| 10 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |
| 11 | `updated_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de la última modificación (UTC) |

<a id="publiccycleways"></a>
## `public.cycleways`

Ciclovías (OpenStreetMap, ODbL)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `name` | character varying(160) | SÍ |  |  | Nombre de la ciclovía (opcional) |
| 3 | `is_protected` | boolean | NO | `false` |  | Verdadero si está segregada del tráfico |
| 4 | `osm_id` | bigint | SÍ |  | UQ | Identificador del way de OpenStreetMap (único si existe) |
| 5 | `geom` | geometry(LineString,4326) | NO |  |  | Trazado: LineString SRID 4326 |
| 6 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |

<a id="publicemission_factors"></a>
## `public.emission_factors`

Factores de emisión vigentes por medio de transporte (g CO2/km por pasajero)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `mode` | transport_mode | NO |  | PK, FK → public.transport_modes(mode) | Medio de transporte (PK) |
| 2 | `grams_per_km` | double precision | NO |  |  | Gramos de CO2 por kilómetro y pasajero |
| 3 | `valid_from` | timestamp with time zone | NO | `now()` |  | Inicio de vigencia del valor actual |
| 4 | `updated_by` | uuid | SÍ |  | FK → public.users(id) | Último SUPER_ADMIN que lo modificó (FK a users.id) |

Restricciones CHECK:

- `ck_emission_factors_positive`: `CHECK ((grams_per_km >= (0)::double precision))`

<a id="publicnotifications"></a>
## `public.notifications`

Notificaciones in-app; se conservan 90 días

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `user_id` | uuid | NO |  | FK → public.users(id) | Destinatario (FK a users.id) |
| 3 | `type` | notification_type | NO |  |  | ACHIEVEMENT_UNLOCKED, WEEKLY_SUMMARY o SYSTEM |
| 4 | `title` | character varying(120) | NO |  |  | Título (máx. 120) |
| 5 | `body` | character varying(500) | NO |  |  | Texto (máx. 500) |
| 6 | `data` | jsonb | NO | `'{}'::jsonb` |  | Datos semiestructurados e inmutables del evento (JSONB justificado) |
| 7 | `read_at` | timestamp with time zone | SÍ |  |  | Fecha de lectura; NULL si no se ha leído |
| 8 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |

<a id="publicpermissions"></a>
## `public.permissions`

Catálogo de permisos atómicos RBAC

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `code` | character varying(64) | NO |  | PK | Código del permiso (PK), p. ej. trips:own |
| 2 | `description` | character varying(255) | NO |  |  | Descripción del permiso |

<a id="publicpois"></a>
## `public.pois`

Puntos de interés (supertipo de la especialización EER disjunta y parcial)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | UQ, PK | Identificador UUID v4 (PK) |
| 2 | `name` | character varying(160) | NO |  |  | Nombre del punto de interés |
| 3 | `category` | poi_category | NO |  | UQ | Categoría: BIKE_PARKING, BIKE_SHARING, BUS_STOP, EV_CHARGER, REPAIR_STATION |
| 4 | `description` | text | SÍ |  |  | Descripción libre (opcional) |
| 5 | `attributes` | jsonb | NO | `'{}'::jsonb` |  | Atributos no estructurados (source, osm_id, ref de OSM…); los estructurados viven en los subtipos |
| 6 | `location` | geometry(Point,4326) | NO |  |  | Ubicación: Point SRID 4326 |
| 7 | `is_active` | boolean | NO | `true` |  | Falso = borrado lógico |
| 8 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |
| 9 | `updated_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de la última modificación (UTC) |

<a id="publicrefresh_tokens"></a>
## `public.refresh_tokens`

Refresh tokens rotativos; cada familia es una sesión (dispositivo). Solo se guarda el hash

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador del token (= claim jti) |
| 2 | `user_id` | uuid | NO |  | FK → public.users(id) | Dueño del token (FK a users.id) |
| 3 | `family_id` | uuid | NO |  |  | Familia de rotación = sesión; reutilizar un token revoca toda la familia |
| 4 | `token_hash` | character(64) | NO |  | UQ | SHA-256 del token (nunca el token en claro) |
| 5 | `expires_at` | timestamp with time zone | NO |  |  | Caducidad del token (UTC) |
| 6 | `revoked_at` | timestamp with time zone | SÍ |  |  | Fecha de revocación; NULL si sigue vigente |
| 7 | `replaced_by_id` | uuid | SÍ |  |  | Token que lo sustituyó al rotar |
| 8 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |
| 9 | `session_created_at` | timestamp with time zone | SÍ |  |  | Inicio de la sesión (primer token de la familia) |
| 10 | `last_used_at` | timestamp with time zone | SÍ |  |  | Último uso de la sesión |
| 11 | `user_agent` | character varying(255) | SÍ |  |  | User-Agent del cliente (máx. 255 caracteres), para listar sesiones |

<a id="publicreports"></a>
## `public.reports`

Informes administrativos generados (CSV/PDF), sin datos personales

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `report_type` | report_type | NO |  |  | Tipo de informe: overview, trips, users, co2_by_mode, co2_by_zone, … |
| 3 | `format` | report_format | NO |  |  | csv o pdf |
| 4 | `parameters` | jsonb | NO | `'{}'::jsonb` |  | Parámetros usados (rango de fechas); JSONB justificado |
| 5 | `row_count` | integer | NO |  |  | Número de filas del informe |
| 6 | `content` | bytea | NO |  |  | Contenido binario del archivo generado |
| 7 | `created_by` | uuid | SÍ |  | FK → public.users(id) | Administrador que lo generó (FK a users.id) |
| 8 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |

Restricciones CHECK:

- `ck_reports_row_count_positive`: `CHECK ((row_count >= 0))`

<a id="publicrole_permissions"></a>
## `public.role_permissions`

Relación N:M entre roles y permisos

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `role` | user_role | NO |  | PK, FK → public.roles(name) | Rol (PK compuesta, FK a roles.name) |
| 2 | `permission_code` | character varying(64) | NO |  | PK, FK → public.permissions(code) | Permiso (PK compuesta, FK a permissions.code) |

<a id="publicroles"></a>
## `public.roles`

Catálogo de roles RBAC

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `name` | user_role | NO |  | PK | Nombre del rol (PK): USER, ADMIN, SUPER_ADMIN |
| 2 | `description` | character varying(255) | NO |  |  | Descripción del rol |
| 3 | `level` | smallint | NO |  |  | Nivel jerárquico (1 = USER, 2 = ADMIN, 3 = SUPER_ADMIN) |

<a id="publicstop_lines"></a>
## `public.stop_lines`

Relación N:M entre paradas y líneas

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `stop_id` | uuid | NO |  | PK, FK → public.transit_stops(poi_id) | Parada (PK compuesta, FK a transit_stops.poi_id) |
| 2 | `line_id` | uuid | NO |  | PK, FK → public.transit_lines(id) | Línea (PK compuesta, FK a transit_lines.id) |

<a id="publictransit_lines"></a>
## `public.transit_lines`

Líneas de transporte público

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `code` | character varying(32) | NO |  | UQ | Clave de la línea (única), p. ej. L55 |
| 3 | `name` | character varying(120) | NO |  |  | Nombre de la línea |
| 4 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |

Restricciones CHECK:

- `ck_transit_lines_code_format`: `CHECK (((code)::text ~ '^[A-Za-z0-9 ._-]{1,32}$'::text))`

<a id="publictransit_stops"></a>
## `public.transit_stops`

Subtipo de pois: paradas de autobús (category = BUS_STOP)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `poi_id` | uuid | NO |  | PK, FK → public.pois(id,category) | PK y FK compuesta (poi_id, category) a pois |
| 2 | `category` | poi_category | NO | `'BUS_STOP'::poi_category` | FK → public.pois(id,category) | Siempre BUS_STOP (garantiza la disyunción) |
| 3 | `code` | character varying(32) | SÍ |  | UQ | Código oficial de parada asignado por un administrador (único, opcional) |
| 4 | `osm_ref` | character varying(64) | SÍ |  |  | Etiqueta ref de OpenStreetMap (informativa, no única) |

Restricciones CHECK:

- `ck_transit_stops_category`: `CHECK ((category = 'BUS_STOP'::poi_category))`
- `ck_transit_stops_code_format`: `CHECK (((code)::text ~ '^[A-Z0-9_-]{2,32}$'::text))`

<a id="publictransport_modes"></a>
## `public.transport_modes`

Configuración por medio de transporte (sin factor ni etiqueta)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `mode` | transport_mode | NO |  | PK | Medio de transporte (PK) |
| 2 | `max_speed_kmh` | double precision | NO |  |  | Velocidad media máxima plausible (km/h) para validar viajes |
| 3 | `is_active` | boolean | NO | `true` |  | Falso = no se aceptan viajes nuevos con este medio |

Restricciones CHECK:

- `ck_transport_modes_speed`: `CHECK (((max_speed_kmh > (0)::double precision) AND (max_speed_kmh <= (300)::double precision)))`

<a id="publictrips"></a>
## `public.trips`

Viajes registrados. La distancia, el CO2 y los puntos los calcula solo el servidor

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `user_id` | uuid | NO |  | UQ, FK → public.users(id) | Dueño del viaje (FK a users.id) |
| 3 | `client_trip_id` | uuid | NO |  | UQ | UUID generado por el cliente para idempotencia (único por usuario) |
| 4 | `mode` | transport_mode | NO |  | FK → public.transport_modes(mode) | Medio de transporte (FK a transport_modes.mode) |
| 5 | `status` | trip_status | NO | `'COMPLETED'::trip_status` |  | COMPLETED o CANCELLED |
| 6 | `started_at` | timestamp with time zone | NO |  |  | Inicio del viaje (UTC) |
| 7 | `ended_at` | timestamp with time zone | NO |  |  | Fin del viaje (UTC); posterior al inicio |
| 8 | `distance_m` | double precision | NO |  |  | Distancia geodésica en metros calculada por PostGIS |
| 9 | `duration_s` | integer | NO |  |  | Duración en segundos |
| 10 | `route` | geometry(LineString,4326) | NO |  |  | Traza del viaje: LineString SRID 4326 (dato personal sensible) |
| 11 | `emission_factor_g_per_km` | double precision | NO |  |  | Factor aplicado (g CO2/km por pasajero) al calcular el viaje; histórico |
| 12 | `co2_emitted_g` | double precision | NO |  |  | CO2 emitido estimado, en gramos |
| 13 | `co2_saved_g` | double precision | NO |  |  | CO2 evitado estimado frente al automóvil de referencia, en gramos |
| 14 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |
| 15 | `source` | trip_source | NO | `'GPS'::trip_source` |  | Origen: GPS (grabado) o PLANNED (ruta de /routes con route_token) |
| 16 | `points` | integer | NO | `0` |  | Puntos ganados = floor(co2_saved_g / 100); 0 si está cancelado |
| 17 | `recurrence_id` | uuid | SÍ |  |  | Serie de viajes recurrentes a la que pertenece (NULL si es suelto) |
| 18 | `updated_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de la última modificación (UTC) |
| 19 | `vehicle_type` | vehicle_type | SÍ |  | FK → public.vehicle_types(code) | Tipo de automóvil (solo CAR/CARPOOL; FK a vehicle_types.code) |
| 20 | `occupants` | smallint | SÍ |  |  | Ocupantes del automóvil, 1–8 (solo CAR/CARPOOL; CARPOOL ≥ 2) |

Restricciones CHECK:

- `ck_trips_carpool_occupants`: `CHECK (((mode <> 'CARPOOL'::transport_mode) OR (occupants IS NULL) OR (occupants >= 2)))`
- `ck_trips_co2_positive`: `CHECK (((co2_emitted_g >= (0)::double precision) AND (co2_saved_g >= (0)::double precision)))`
- `ck_trips_distance_duration`: `CHECK (((distance_m >= (0)::double precision) AND (duration_s > 0)))`
- `ck_trips_occupants_range`: `CHECK (((occupants IS NULL) OR ((occupants >= 1) AND (occupants <= 8))))`
- `ck_trips_time_order`: `CHECK ((ended_at > started_at))`
- `ck_trips_vehicle_only_car`: `CHECK (((mode = ANY (ARRAY['CAR'::transport_mode, 'CARPOOL'::transport_mode])) OR ((vehicle_type IS NULL) AND (occupants IS NULL))))`

<a id="publicuser_achievements"></a>
## `public.user_achievements`

Logros obtenidos por cada usuario (N:M users–achievements)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `user_id` | uuid | NO |  | UQ, FK → public.users(id) | Usuario (FK a users.id) |
| 3 | `achievement_id` | uuid | NO |  | UQ, FK → public.achievements(id) | Logro (FK a achievements.id); único por usuario |
| 4 | `bonus_points` | integer | NO | `0` |  | Bono congelado al otorgarlo (editar el logro no altera puntos ganados) |
| 5 | `awarded_at` | timestamp with time zone | NO | `now()` |  | Fecha en que se otorgó |

<a id="publicuser_preferences"></a>
## `public.user_preferences`

Preferencias del usuario (1:1 con users; normalización del antiguo JSONB)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  | PK, FK → public.users(id) | PK y FK a users.id (relación 1:1) |
| 2 | `language` | character varying(2) | NO | `'es'::character varying` |  | Idioma de la interfaz: es o en |
| 3 | `default_mode` | transport_mode | SÍ |  | FK → public.transport_modes(mode) | Medio de transporte preferido (opcional) |
| 4 | `weekly_goal_trips` | smallint | SÍ |  |  | Meta semanal de viajes, 1–100 (opcional) |
| 5 | `email_notifications` | boolean | NO | `true` |  | Acepta recibir correos informativos |
| 6 | `updated_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de la última modificación (UTC) |
| 7 | `default_vehicle_type` | vehicle_type | SÍ |  | FK → public.vehicle_types(code) | Tipo de automóvil por omisión para CAR/CARPOOL y como referencia de ahorro (FK) |

Restricciones CHECK:

- `ck_user_preferences_language`: `CHECK (((language)::text = ANY (ARRAY[('es'::character varying)::text, ('en'::character varying)::text])))`
- `ck_user_preferences_weekly_goal`: `CHECK (((weekly_goal_trips IS NULL) OR ((weekly_goal_trips >= 1) AND (weekly_goal_trips <= 100))))`

<a id="publicuser_tokens"></a>
## `public.user_tokens`

Tokens de un solo uso para restablecer contraseña y verificar correo (solo hash)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `user_id` | uuid | NO |  | FK → public.users(id) | Dueño del token (FK a users.id) |
| 3 | `purpose` | token_purpose | NO |  |  | Propósito: PASSWORD_RESET o EMAIL_VERIFICATION |
| 4 | `token_hash` | character(64) | NO |  | UQ | SHA-256 del token (único) |
| 5 | `expires_at` | timestamp with time zone | NO |  |  | Caducidad: 30 min (reset) o 48 h (verificación) |
| 6 | `used_at` | timestamp with time zone | SÍ |  |  | Fecha de uso; NULL si no se ha usado |
| 7 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |

Restricciones CHECK:

- `ck_user_tokens_expiry`: `CHECK ((expires_at > created_at))`

<a id="publicusers"></a>
## `public.users`

Cuentas de usuario. Datos personales mínimos (LFPDPPP); la contraseña solo como hash Argon2id

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO |  | PK | Identificador UUID v4 (PK) |
| 2 | `email` | character varying(254) | NO |  | UQ | Correo electrónico en minúsculas; único; identificador de inicio de sesión |
| 3 | `password_hash` | character varying(255) | NO |  |  | Hash Argon2id de la contraseña (nunca la contraseña en claro) |
| 4 | `full_name` | character varying(120) | NO |  |  | Nombre completo para mostrar (1–120 caracteres) |
| 5 | `role` | user_role | NO | `'USER'::user_role` | FK → public.roles(name) | Rol RBAC: USER, ADMIN o SUPER_ADMIN (FK a roles.name) |
| 6 | `is_active` | boolean | NO | `true` |  | Falso = cuenta desactivada por un administrador; no puede iniciar sesión |
| 7 | `failed_login_attempts` | integer | NO | `0` |  | Contraseñas incorrectas consecutivas (bloqueo anti fuerza bruta) |
| 8 | `locked_until` | timestamp with time zone | SÍ |  |  | Bloqueo temporal de la cuenta hasta esta fecha (UTC); NULL si no está bloqueada |
| 9 | `last_login_at` | timestamp with time zone | SÍ |  |  | Último inicio de sesión correcto (UTC) |
| 10 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |
| 11 | `updated_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de la última modificación (UTC) |
| 12 | `email_verified_at` | timestamp with time zone | SÍ |  |  | Fecha de verificación del correo; NULL si no se ha verificado |
| 13 | `ranking_opt_in` | boolean | NO | `false` |  | Consentimiento para aparecer en el ranking público (por defecto falso) |
| 14 | `token_version` | integer | NO | `0` |  | Versión de tokens; al incrementarse invalida todos los access tokens emitidos |

Restricciones CHECK:

- `ck_users_email_lowercase`: `CHECK (((email)::text = lower((email)::text)))`
- `ck_users_failed_attempts_positive`: `CHECK ((failed_login_attempts >= 0))`

<a id="publicvehicle_types"></a>
## `public.vehicle_types`

Tipos de automóvil y su factor de emisión por vehículo, con fuente citada (APA)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `code` | vehicle_type | NO |  | PK | Tipo de vehículo (PK): COMPACT, SEDAN, SUV, PICKUP, MINIVAN, HYBRID, ELECTRIC |
| 2 | `grams_per_km` | double precision | NO |  |  | Gramos de CO2 por kilómetro del vehículo completo |
| 3 | `max_occupants` | smallint | NO |  |  | Ocupantes máximos admitidos (1–8) |
| 4 | `is_active` | boolean | NO | `true` |  | Disponible para nuevos viajes |
| 5 | `source` | character varying(300) | NO |  |  | Fuente del factor en formato APA o nota de estimación |
| 6 | `updated_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de la última modificación (UTC) |

Restricciones CHECK:

- `ck_vehicle_types_factor`: `CHECK (((grams_per_km >= (0)::double precision) AND (grams_per_km <= (5000)::double precision)))`
- `ck_vehicle_types_max_occupants`: `CHECK (((max_occupants >= 1) AND (max_occupants <= 8)))`

<a id="geomobility_zones"></a>
## `geo.mobility_zones`

Zonas de análisis (municipios y AGEB del INEGI, zonas de ADMIN y zonas DEMO)

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` | PK | Identificador UUID v4 (PK) |
| 2 | `code` | text | SÍ |  | UQ | Clave única de la zona (CVEGEO del INEGI o código de ADMIN) |
| 3 | `name` | text | NO |  |  | Nombre de la zona |
| 4 | `kind` | text | NO |  |  | Tipo: colonia, ageb, municipio, distrito o custom |
| 5 | `geom` | geometry(MultiPolygon,4326) | NO |  |  | Polígono: MultiPolygon SRID 4326 |
| 6 | `geom_utm` | geometry(MultiPolygon,32614) | SÍ | `st_transform(geom, 32614)` |  | Polígono en UTM 14N (EPSG:32614) para cálculos métricos |
| 7 | `area_km2` | double precision | SÍ | `(st_area((geom)::geography) / ('1000000'::numeric)::double precision)` |  | Superficie en km² |
| 8 | `source` | text | NO |  |  | Fuente de la geometría, p. ej. INEGI-MG-2020 o DEMO |
| 9 | `is_demo` | boolean | NO | `false` |  | Verdadero = zona sintética de demostración; nunca se mezcla con datos oficiales |
| 10 | `created_at` | timestamp with time zone | NO | `now()` |  | Fecha y hora de creación (UTC) |

Restricciones CHECK:

- `mobility_zones_demo_source`: `CHECK ((is_demo = (source = 'DEMO'::text)))`
- `mobility_zones_kind_check`: `CHECK ((kind = ANY (ARRAY['colonia'::text, 'ageb'::text, 'municipio'::text, 'distrito'::text, 'custom'::text])))`

<a id="geozone_census"></a>
## `geo.zone_census`

Población y vivienda del Censo 2020 (INEGI) por zona

| # | Columna | Tipo | Nulo | Por defecto | Restricciones | Descripción |
|---|---|---|---|---|---|---|
| 1 | `zone_code` | text | NO |  | PK, FK → geo.mobility_zones(code) | Zona (PK compuesta, FK a geo.mobility_zones.code) |
| 2 | `source` | text | NO |  | PK | Levantamiento (PK compuesta), p. ej. INEGI-CPV-2020 |
| 3 | `pobtot` | integer | SÍ |  |  | Población total (NULL si INEGI la protege por confidencialidad) |
| 4 | `tvivparhab` | integer | SÍ |  |  | Viviendas particulares habitadas |
| 5 | `vph_autom` | integer | SÍ |  |  | Viviendas con automóvil o camioneta |
| 6 | `vph_moto` | integer | SÍ |  |  | Viviendas con motocicleta o motoneta |
| 7 | `vph_bici` | integer | SÍ |  |  | Viviendas con bicicleta como medio de transporte |

Restricciones CHECK:

- `zone_census_pobtot_check`: `CHECK ((pobtot >= 0))`
- `zone_census_tvivparhab_check`: `CHECK ((tvivparhab >= 0))`
- `zone_census_vph_autom_check`: `CHECK ((vph_autom >= 0))`
- `zone_census_vph_bici_check`: `CHECK ((vph_bici >= 0))`
- `zone_census_vph_moto_check`: `CHECK ((vph_moto >= 0))`
