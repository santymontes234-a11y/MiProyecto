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

## 2. Diagramas

- **MER:** `docs/report/diagramas/MER.svg`, con fuente Mermaid en `MER.mmd`.
- **EER:** `docs/report/diagramas/EER.svg`, en notación de Chen.
- Ambos los genera `generar_diagramas.py` a partir del catálogo de la BD.

Relaciones principales:

```
users 1──1 user_preferences            roles 1──* users              roles *──* permissions (role_permissions)
users 1──* trips *──1 transport_modes 1──1 emission_factors        trips *──0..1 vehicle_types
users 1──* refresh_tokens (sesión = family_id)   users 1──* user_tokens   users 1──* notifications
users *──* achievements (user_achievements)      users 1──* citizen_reports *──0..1 pois
pois ⊃ transit_stops (BUS_STOP) | bike_stations (BIKE_SHARING/BIKE_PARKING)   — especialización disjunta y parcial
transit_stops *──* transit_lines (stop_lines)    cycleways (OSM)    geo.mobility_zones 1──* geo.zone_census
users 1──* audit_logs (actor_id, SET NULL)       users 1──* reports (created_by, SET NULL)
```

## 3. Tablas

Son 25: 23 en `public` y 2 en `geo`. Las fuentes de detalle son:

- **Columnas, tipos, restricciones y descripción:** `docs/report/DICCIONARIO_DATOS.md`, generado desde los `COMMENT ON`, cuya fuente es `apps/api/app/models/comments.py`.
- **Formas normales, dependencias funcionales y excepciones JSONB:** `docs/report/NORMALIZACION.md`.

| Tabla | Propósito | Notas clave |
|---|---|---|
| `users` | Cuentas | `email` único en minúsculas; Argon2id; `role` con FK a `roles`; `token_version` invalida los access tokens; bloqueo por fuerza bruta |
| `user_preferences` | Preferencias (1:1) | Idioma, medio y tipo de vehículo por omisión, meta semanal |
| `roles`, `permissions`, `role_permissions` | RBAC | El permiso se lee de la BD en cada petición (`require_permission`) |
| `refresh_tokens` | Sesiones | Solo hash SHA-256; rotación por `family_id`; la reutilización revoca la familia |
| `user_tokens` | Reset y verificación de correo | Solo hash; un solo uso; caducan |
| `trips` | Viajes | Traza `LineString` (GiST); distancia, CO₂ y puntos calculados en el servidor; `source` GPS/PLANNED; `vehicle_type` y `occupants` solo en CAR/CARPOOL; único `(user_id, client_trip_id)` |
| `transport_modes` | Medios | `max_speed_kmh` (validación de plausibilidad) e `is_active` |
| `emission_factors` | Factor vigente por medio | 1:1 con `transport_modes`; el viaje conserva el factor histórico |
| `vehicle_types` | Factor por tipo de auto | Fuente APA en `source` (§4) |
| `achievements`, `user_achievements` | Logros | `bonus_points` congelado al otorgar |
| `notifications` | Avisos in-app | Retención de 90 días |
| `pois` | Puntos de interés (supertipo) | `UNIQUE (id, category)` para la FK compuesta de los subtipos; borrado lógico |
| `transit_stops`, `bike_stations` | Subtipos de POI | FK `(poi_id, category)` + CHECK de categoría = disyunción garantizada por la BD |
| `transit_lines`, `stop_lines` | Líneas y relación N:M parada–línea | |
| `cycleways` | Ciclovías (OSM) | `osm_id` único |
| `citizen_reports` | Reportes ciudadanos | `reporter_id` pasa a NULL si el usuario borra su cuenta |
| `reports` | Informes CSV/PDF | Sin datos personales; descarga auditada |
| `audit_logs` | Bitácora | Solo se añaden filas; payload redactado |
| `geo.mobility_zones` | Zonas (INEGI, ADMIN, DEMO) | `geom_utm` y `area_km2` generadas; `is_demo` nunca se mezcla con datos oficiales |
| `geo.zone_census` | Censo 2020 por zona | PK `(zone_code, source)` |

Migraciones: 0001 inicial · 0002 RBAC y factores · 0003 esquema geo · 0004 ref OSM · 0005 contrato 1.1 · 0006 normalización · 0007 tipos de vehículo · 0008 censo y factores EPA · 0009 comentarios · 0010 FK a catálogos.

## 4. Datos semilla — factores

**`emission_factors`** (g CO₂/km por pasajero). Son valores iniciales del prototipo **sin fuente oficial trazable** (`docs/report/DATASETS.md` §6); el SUPER_ADMIN los ajusta.

| WALK | BICYCLE | E_SCOOTER | BUS | CARPOOL | MOTORCYCLE | CAR |
|---|---|---|---|---|---|---|
| 0 | 0 | 25 | 68 | 64 | 103 | 192 |

**`vehicle_types`** (g CO₂/km por vehículo, migración 0008):

- Con fuente EPA (2026), año modelo 2024: SEDAN 174, SUV 224, MINIVAN 217 y PICKUP 272.
- Estimaciones propias: COMPACT 150 y HYBRID 110.
- Pendiente de verificar: ELECTRIC 75.

Fórmula (contrato 1.2 §4.3):

- CAR y CARPOOL: `emitido = km·f(v)/ocupantes` y `ahorro = km·f(v) − emitido`.
- Resto de medios: `ahorro = km·(f(v_ref) − f(medio))`, con `v_ref` = SEDAN o el tipo preferido del usuario.

Desde 1.2, `emission_factors.CAR` ya no interviene en el cálculo.

## 5. Consultas

Los ejemplos completos están en `database/03_consultas.sql`: JOIN, GROUP BY/HAVING, subconsultas, CTE, funciones de ventana, una vista, índices con EXPLAIN, consultas espaciales y CRUD. Las consultas espaciales avanzadas están en `apps/api/db/geo/queries/consultas_espaciales.sql`.

```sql
-- POIs en bbox (índice GiST ix_pois_location)
SELECT ... FROM pois
WHERE is_active AND location && ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
LIMIT :limit;

-- Distancia de una traza (siempre en el servidor)
SELECT ST_Length(ST_GeomFromGeoJSON(:geojson)::geography);
```

## 6. Operación

- Desarrollo: `infrastructure/docker-compose.yml` (volumen `ecomove_pgdata`).
- La extensión `postgis` se crea en `infrastructure/postgres/init/01-extensions.sql` y también en la
  migración inicial (idempotente).
- Respaldos (producción): `pg_dump` diario + WAL; retención 30 días.
- Entregable ABD: scripts `database/01_esquema.sql`, `02_datos_ejemplo.sql` y `03_consultas.sql`.
  La forma de ejecutarlos está en `database/README.md`.
