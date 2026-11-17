# Normalización del modelo de datos de EcoMove Querétaro

> Entregable ABD R5–R7. Base de datos: PostgreSQL 16 con PostGIS 3.4.
>
> **Esquema:**
> - Migraciones Alembic 0001–0010 (`apps/api/alembic/versions`).
> - Script equivalente: `database/01_esquema.sql`.
>
> **Material relacionado:**
> - Diagramas: `docs/report/diagramas/` (MER y EER).
> - Detalle de cada columna: `docs/report/DICCIONARIO_DATOS.md`.

## 1. Alcance y conteo de tablas

El modelo tiene **25 tablas**: 23 en el esquema `public` y 2 en `geo`. Las tablas sintéticas `geo.demo_*` no se cuentan, porque solo sirven para demostraciones del módulo de analítica (REQUISITOS_ABD §3).

| Grupo | Tablas |
|---|---|
| Usuarios y seguridad | `users`, `user_preferences`, `roles`, `permissions`, `role_permissions`, `refresh_tokens`, `user_tokens`, `audit_logs` |
| Movilidad | `trips`, `transport_modes`, `emission_factors`, `vehicle_types` |
| Gamificación y comunicación | `achievements`, `user_achievements`, `notifications` |
| Infraestructura (OSM) | `pois`, `transit_stops`, `bike_stations`, `transit_lines`, `stop_lines`, `cycleways` |
| Participación y administración | `citizen_reports`, `reports` |
| Territorio (INEGI) | `geo.mobility_zones`, `geo.zone_census` |

**Buenas prácticas aplicadas:**

- **Claves e identificadores:** claves sustitutas UUID v4; restricciones `UNIQUE` sobre las claves naturales (`email`, `code`, `osm_id`…); FK con acciones explícitas (`CASCADE`, `SET NULL` o `RESTRICT`).
- **Validación de datos:** `CHECK` de dominio (rangos, formatos y reglas como «CARPOOL ≥ 2 ocupantes»); tipos `ENUM` sincronizados con el contrato de la API.
- **Tipos especializados:** fechas `timestamptz` en UTC; geometrías SRID 4326 con índices GiST.
- **Seguridad:** las contraseñas se guardan solo como hash Argon2id, y los tokens como SHA-256.
- **Documentación:** cada tabla y cada columna tienen `COMMENT ON`.

## 2. Método

Para cada tabla se identificó la clave candidata y se enumeraron las dependencias funcionales (DF) no triviales. Después se comprobó cada forma normal:

- **1FN:** dominios atómicos y sin grupos repetitivos. Esto incluye que ninguna columna JSON guarde datos estructurados que se consulten o se relacionen.
- **2FN:** ningún atributo no primo depende de una parte de una clave compuesta.
- **3FN:** ningún atributo no primo depende transitivamente de la clave, es decir, a través de otro atributo no primo.
- **FNBC:** todo determinante es superclave. Se indica cuando se cumple.

> **Notación:** `X → Y` significa que X determina funcionalmente a Y. Las claves van **subrayadas** en el EER y marcadas **PK** en el MER.

## 3. Cambios de normalización aplicados (migración 0006 y siguientes)

| Antes | Problema | Después |
|---|---|---|
| `users.preferences jsonb` (`language`, `default_mode`, `weekly_goal_trips`, `email_notifications`) | Violaba la 1FN: era un atributo compuesto no atómico y no se podían declarar CHECK ni FK por campo | Tabla `user_preferences` (relación 1:1, con PK = FK a `users.id`), con CHECK y FK a `transport_modes` y `vehicle_types` |
| `pois.attributes.code` y `attributes.lines` (lista) | Violaba la 1FN: `lines` era un grupo repetitivo; `code` solo aplicaba a algunas categorías, lo que llenaba la tabla de nulos y no permitía exigir unicidad | Especialización EER: `transit_stops` (BUS_STOP: `code` oficial único y `osm_ref`), `bike_stations` (BIKE_SHARING y BIKE_PARKING: `code` y `capacity`), `transit_lines` y la tabla N:M `stop_lines` |
| `pois.attributes.capacity` | Era un atributo que dependía del subtipo y no de `pois` | `bike_stations.capacity` con `CHECK 1..10000` |
| `users.role`, `trips.mode`, `emission_factors.mode` y `user_preferences.default_mode` usaban solo ENUM | Las relaciones con los catálogos eran implícitas | FK explícitas a `roles.name` y `transport_modes.mode` (migración 0010) |
| Factor del automóvil único (`emission_factors.CAR`) | El factor dependía del tipo de vehículo, que no se modelaba | Tabla `vehicle_types` con fuente citada, más `trips.vehicle_type` y `trips.occupants` (migraciones 0007 y 0008) |

La **disyunción** de la especialización se garantiza en la propia BD, sin depender de la aplicación:

- `pois` tiene `UNIQUE (id, category)`.
- Cada subtipo referencia a `pois` con la FK compuesta `(poi_id, category) → pois(id, category)`.
- Cada subtipo tiene además un `CHECK` sobre `category`: `transit_stops` exige `BUS_STOP` y `bike_stations` exige `BIKE_SHARING` o `BIKE_PARKING`.

Así, un POI no puede estar en los dos subtipos, ni en el subtipo que no corresponde a su categoría. La especialización es **parcial**: `EV_CHARGER` y `REPAIR_STATION` no tienen subtipo.

## 4. Análisis por tabla

DF = dependencias funcionales no triviales (se omiten las que se deducen por reflexividad). Las claves candidatas alternativas aparecen como «CK».

### 4.1 Usuarios y seguridad

| Tabla | Clave(s) | Dependencias funcionales | 1FN | 2FN | 3FN | Observaciones |
|---|---|---|:-:|:-:|:-:|---|
| `users` | PK `id`; CK `email` | `id → email, password_hash, full_name, role, is_active, failed_login_attempts, locked_until, last_login_at, email_verified_at, ranking_opt_in, token_version, created_at, updated_at`; `email → id` | ✔ | ✔ | ✔ | FNBC: los dos determinantes son claves. `email_verified` (booleano) es un atributo derivado y no se guarda: se calcula a partir de `email_verified_at` |
| `user_preferences` | PK `user_id` | `user_id → language, default_mode, weekly_goal_trips, email_notifications, default_vehicle_type, updated_at` | ✔ | ✔ | ✔ | Relación 1:1. Se separa porque es opcional y cambia con otra frecuencia (sale del antiguo JSONB) |
| `roles` | PK `name` | `name → description, level` | ✔ | ✔ | ✔ | Catálogo |
| `permissions` | PK `code` | `code → description` | ✔ | ✔ | ✔ | Catálogo |
| `role_permissions` | PK `(role, permission_code)` | — (solo la clave) | ✔ | ✔ | ✔ | Tabla de asociación N:M |
| `refresh_tokens` | PK `id`; CK `token_hash` | `id → user_id, family_id, token_hash, expires_at, revoked_at, replaced_by_id, created_at, session_created_at, last_used_at, user_agent` | ✔ | ✔ | ✔* | *`session_created_at` y `user_agent` son atributos de la **sesión** (`family_id`) y se repiten en cada token de la familia. Es una **desnormalización deliberada**: los tokens rotan en cada uso y el historial de la familia se consulta junto. Separar `sessions` añadiría un JOIN en cada petición autenticada (`_session_active`). Ver §5 |
| `user_tokens` | PK `id`; CK `token_hash` | `id → user_id, purpose, token_hash, expires_at, used_at, created_at` | ✔ | ✔ | ✔ | Solo se guarda el hash del token |
| `audit_logs` | PK `id` | `id → actor_id, action, entity_type, entity_id, payload, created_at` | ✔† | ✔ | ✔ | †`payload` es JSONB justificado (§5) |

### 4.2 Movilidad

| Tabla | Clave(s) | Dependencias funcionales | 1FN | 2FN | 3FN | Observaciones |
|---|---|---|:-:|:-:|:-:|---|
| `trips` | PK `id`; CK `(user_id, client_trip_id)` | `id → user_id, client_trip_id, mode, status, started_at, ended_at, route, source, recurrence_id, vehicle_type, occupants, distance_m, duration_s, emission_factor_g_per_km, co2_emitted_g, co2_saved_g, points, created_at, updated_at` | ✔ | ✔ | ✔‡ | ‡Ver la nota de abajo |
| `transport_modes` | PK `mode` | `mode → max_speed_kmh, is_active` | ✔ | ✔ | ✔ | Catálogo; sin etiquetas, que pertenecen a los clientes |
| `emission_factors` | PK `mode` (FK) | `mode → grams_per_km, valid_from, updated_by` | ✔ | ✔ | ✔ | Relación 1:1 con `transport_modes`. Se separa porque tiene otro ciclo de vida y otro permiso (`emission_factors:write`) |
| `vehicle_types` | PK `code` | `code → grams_per_km, max_occupants, is_active, source, updated_at` | ✔ | ✔ | ✔ | Factores con su fuente (§6) |

‡ **Atributos derivados guardados en `trips`.** `distance_m`, `duration_s`, `co2_*` y `points` se podrían recalcular a partir de `route`, las fechas y los factores **vigentes**. Se guardan a propósito por dos razones:

1. **Historia.** El contrato (ADR-002) exige que un viaje conserve el factor con el que se calculó. Si un SUPER_ADMIN cambia un factor, los viajes pasados no se alteran. Por tanto `emission_factor_g_per_km` **no** depende funcionalmente de `mode` a lo largo del tiempo: es un hecho del viaje.
2. **Rendimiento.** Las estadísticas suman millones de filas sin recalcular geometrías.

Con esa semántica, cada valor depende solo de la clave del viaje (`id`) y la 3FN se mantiene. `duration_s = ended_at − started_at` sí es una dependencia derivable: se guarda como entero por eficiencia y no puede contradecirse, porque solo la escribe el servicio.

### 4.3 Gamificación y comunicación

| Tabla | Clave(s) | Dependencias funcionales | 1FN | 2FN | 3FN | Observaciones |
|---|---|---|:-:|:-:|:-:|---|
| `achievements` | PK `id`; CK `code` | `id → code, name, description, icon, criterion, threshold, bonus_points, is_active, created_at, updated_at` | ✔ | ✔ | ✔ | FNBC |
| `user_achievements` | PK `id`; CK `(user_id, achievement_id)` | `(user_id, achievement_id) → id, bonus_points, awarded_at` | ✔ | ✔ | ✔ | `bonus_points` se **congela** al otorgar el logro: es el bono que se ganó en ese momento y no el valor vigente en `achievements`, por lo que no hay dependencia transitiva |
| `notifications` | PK `id` | `id → user_id, type, title, body, data, read_at, created_at` | ✔† | ✔ | ✔ | †`data` es JSONB justificado (§5) |

### 4.4 Infraestructura

| Tabla | Clave(s) | Dependencias funcionales | 1FN | 2FN | 3FN | Observaciones |
|---|---|---|:-:|:-:|:-:|---|
| `pois` | PK `id`; CK `(id, category)` | `id → name, category, description, attributes, location, is_active, created_at, updated_at` | ✔† | ✔ | ✔ | Supertipo. †`attributes` solo guarda metadatos de procedencia (`source`, `osm_id`, `license`, `ref` de OSM), que no se consultan por campo (§5) |
| `transit_stops` | PK `poi_id`; CK `code` | `poi_id → category, code, osm_ref`; `code → poi_id` | ✔ | ✔ | ✔ | Subtipo (BUS_STOP). FNBC: `code` es clave candidata (UNIQUE) |
| `bike_stations` | PK `poi_id`; CK `code` | `poi_id → category, code, capacity` | ✔ | ✔ | ✔ | Subtipo (BIKE_SHARING o BIKE_PARKING) |
| `transit_lines` | PK `id`; CK `code` | `id → code, name, created_at` | ✔ | ✔ | ✔ | |
| `stop_lines` | PK `(stop_id, line_id)` | — | ✔ | ✔ | ✔ | Tabla N:M entre paradas y líneas; sustituye a la lista `attributes.lines` |
| `cycleways` | PK `id`; CK `osm_id` | `id → name, is_protected, osm_id, geom, created_at` | ✔ | ✔ | ✔ | La longitud se deriva de `geom` y no se guarda |

### 4.5 Participación, administración y territorio

| Tabla | Clave(s) | Dependencias funcionales | 1FN | 2FN | 3FN | Observaciones |
|---|---|---|:-:|:-:|:-:|---|
| `citizen_reports` | PK `id` | `id → reporter_id, category, status, title, description, location, poi_id, resolution_note, created_at, updated_at` | ✔ | ✔ | ✔ | |
| `reports` | PK `id` | `id → report_type, format, parameters, row_count, content, created_by, created_at` | ✔† | ✔ | ✔ | †`parameters` es JSONB justificado. `content` guarda el archivo generado, que es inmutable (bytea) |
| `geo.mobility_zones` | PK `id`; CK `code` | `id → code, name, kind, geom, source, is_demo, created_at`; `geom → geom_utm, area_km2` | ✔ | ✔ | ✔§ | §`geom_utm` y `area_km2` son **columnas generadas** (`GENERATED ALWAYS AS … STORED`). Su dependencia de `geom` la mantiene el propio SGBD, así que no puede haber anomalías de actualización |
| `geo.zone_census` | PK `(zone_code, source)` | `(zone_code, source) → pobtot, tvivparhab, vph_autom, vph_moto, vph_bici` | ✔ | ✔ | ✔ | Entidad débil de la zona. Los atributos dependen de la clave **completa**: un mismo `zone_code` tendría otros valores en otro levantamiento (`source`) |

## 5. Excepciones justificadas (JSONB y desnormalización controlada)

| Columna | Por qué se mantiene | Por qué no rompe la integridad |
|---|---|---|
| `audit_logs.payload` | Cada acción registra un detalle distinto (cambio de rol, motivo, campos editados). Es un registro **inmutable** (solo se añade) y no se consulta por sus campos | Nunca se actualiza; se redacta antes de insertarse, sin secretos ni coordenadas |
| `notifications.data` | Contexto variable por tipo de notificación (`achievement_code`, resumen semanal). Lo lee el cliente tal cual | Es inmutable; las notificaciones caducan a los 90 días |
| `reports.parameters` | Parámetros con que se generó un informe (rango de fechas), solo informativos | Inmutable; el informe no se regenera a partir de ellos |
| `pois.attributes` | Metadatos de procedencia de OSM (`source`, `osm_id`, `license`, `ref`) | Los datos estructurados (`code`, `capacity` y líneas) ya están en los subtipos; ninguna FK ni regla de negocio depende de este JSONB |
| `refresh_tokens.session_created_at` y `user_agent` | Rendimiento de la autenticación: se comprueba la sesión con una sola tabla en cada petición | Se escriben solo al crear el token, copiados del token anterior de la familia; nunca se editan |

## 6. Fuentes de los factores (`vehicle_types` y `emission_factors`)

Los factores de `vehicle_types` (g CO₂/km por **vehículo**) proceden del rendimiento real de la EPA para el año modelo 2024, sin vehículos eléctricos de batería (BEV) ni híbridos enchufables (PHEV), convertido con 8 887 g CO₂ por galón (migración 0008; detalle en `DATASETS.md` §5).

| Tipo | g CO₂/km | Ocupantes máx. | Fuente |
|---|---|---|---|
| SEDAN | 174 | 5 | EPA (2026), sedán/familiar |
| SUV | 224 | 7 | EPA (2026), *truck SUV* |
| MINIVAN | 217 | 8 | EPA (2026), minivan/van |
| PICKUP | 272 | 5 | EPA (2026), pickup |
| COMPACT | 150 | 5 | Estimación propia: la EPA no publica la cifra por tipo |
| HYBRID | 110 | 5 | Estimación propia: la EPA no publica la cifra por tipo |
| ELECTRIC | 75 | 5 | Estimación propia: 0.17 kWh/km por el factor de la red; **pendiente de verificar** con el factor vigente de la CRE/SEMARNAT |

**Fórmula (contrato 1.2 §4.3):**

- CAR y CARPOOL: `emitido = km × f(v) / ocupantes` y `ahorro = km × f(v) − emitido`.
- Resto de medios: `ahorro = km × (f(v_ref) − f(medio))`, donde `v_ref` es el tipo preferido del usuario o, si no tiene, SEDAN.

Los factores por medio de `emission_factors` son supuestos del prototipo **sin fuente oficial trazable** (DATASETS.md §6) y así se deben presentar en el informe.

**Referencias (APA 7):**

U.S. Environmental Protection Agency. (2026). *The 2025 EPA automotive trends report: Greenhouse gas emissions, fuel economy, and technology since 1975* (EPA-420-R-26-001). https://www.epa.gov/automotive-trends

U.S. Environmental Protection Agency. (2023). *Greenhouse gas emissions from a typical passenger vehicle* (EPA-420-F-23-014). https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle

## 7. Modelo EER (resumen de `diagramas/EER.svg`)

- **Especialización de POI:** disjunta y parcial, discriminada por `category`. Los subtipos son PARADA (`transit_stops`) y ESTACIÓN DE BICI (`bike_stations`).
- **Especialización de USUARIO:** disjunta y total, discriminada por el atributo `role`. Los subtipos son CIUDADANO (USER), ADMINISTRADOR (ADMIN) y SUPERADMINISTRADOR (SUPER_ADMIN).
  - En el modelo relacional se implementa con **una sola tabla** más el discriminador `role`, con FK a `roles`, porque los subtipos no tienen atributos propios: solo difieren en las relaciones en que participan y en sus permisos (`role_permissions`).
  - Relaciones exclusivas de cada subtipo: ADMINISTRADOR **atiende** reportes, **genera** informes y **registra** la bitácora; SUPERADMINISTRADOR hereda todo lo anterior y además actualiza factores.
- **Entidades débiles:**
  - SESIÓN (`refresh_tokens`), que depende de USUARIO.
  - PREFERENCIAS, en relación 1:1 con USUARIO.
  - FACTOR DE EMISIÓN, en relación 1:1 con MEDIO DE TRANSPORTE.
  - CENSO (`geo.zone_census`), que depende de ZONA.
- **Relaciones N:M:**
  - USUARIO–LOGRO, con los atributos de relación `awarded_at` y `bonus_points`.
  - ROL–PERMISO.
  - PARADA–LÍNEA.
- **Atributos derivados** (óvalo punteado): `distance_m`, `co2_saved_g` y `points` del viaje, y `area_km2` de la zona.
