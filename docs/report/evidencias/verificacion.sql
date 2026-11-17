-- =============================================================================
-- EcoMove Querétaro — Verificación en base de datos del CRUD funcional (R15)
-- Ejecutar con psql sobre la base usada para las capturas, ANTES y DESPUÉS de cada
-- operación. Los datos son ficticios (dominio ejemplo.mx, nombres «Ejemplo»).
-- La salida real de cada consulta durante la generación de las capturas está en
-- verificacion-resultados.md (tests/e2e/run-local.sh evidence).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. POIs (puntos de infraestructura) — panel de administración
-- -----------------------------------------------------------------------------

-- 1.1 CREATE (Figuras 1 y 2) — antes: 0 filas · después: 1 fila con is_active = true
-- La capacidad vive en la especialización normalizada bike_stations (1:1 con pois).
SELECT p.id, p.name, p.category, b.capacity AS capacidad,
       ST_AsText(p.location) AS ubicacion, p.is_active, p.created_at
FROM pois p
LEFT JOIN bike_stations b ON b.poi_id = p.id
WHERE p.name LIKE 'Ciclopuerto Ejemplo%';

-- 1.2 READ (Figura 3) — lo que el mapa público solicita a la API para el área visible
SELECT id, name, category, ST_X(location) AS lng, ST_Y(location) AS lat
FROM pois
WHERE is_active
  AND location && ST_MakeEnvelope(-100.45, 20.55, -100.35, 20.65, 4326)
ORDER BY name;

-- 1.3 UPDATE (Figura 4) — después: nombre «(ampliado)», capacidad 35 y updated_at posterior a created_at
SELECT p.id, p.name, b.capacity AS capacidad, p.created_at, p.updated_at
FROM pois p
LEFT JOIN bike_stations b ON b.poi_id = p.id
WHERE p.name LIKE 'Ciclopuerto Ejemplo%';

-- 1.4 DELETE (Figuras 5 y 6) — borrado lógico: la fila permanece con is_active = false
SELECT id, name, is_active, updated_at
FROM pois
WHERE name LIKE 'Ciclopuerto Ejemplo%';

-- 1.5 Trazabilidad: cada operación administrativa queda en la auditoría
SELECT a.action, a.entity_type, a.entity_id, u.email AS actor, a.created_at
FROM audit_logs a
LEFT JOIN users u ON u.id = a.actor_id
WHERE a.entity_type = 'poi'
ORDER BY a.created_at;

-- -----------------------------------------------------------------------------
-- 2. Viajes — usuaria ficticia ana.ejemplo@ejemplo.mx
-- -----------------------------------------------------------------------------

-- 2.1 CREATE (registro desde la app Android, ADR-004) — antes: 0 · después: 3 viajes.
--     distance_m y co2_* los calcula el servidor (PostGIS + factor vigente, ADR-002).
SELECT t.id, t.mode, round(t.distance_m) AS distancia_m, t.duration_s,
       t.emission_factor_g_per_km, round(t.co2_saved_g::numeric, 1) AS co2_evitado_g,
       t.started_at
FROM trips t
JOIN users u ON u.id = t.user_id
WHERE u.email = 'ana.ejemplo@ejemplo.mx'
ORDER BY t.started_at DESC;

-- Comprobación independiente de la distancia calculada (geografía WGS84, metros)
SELECT t.id, round(t.distance_m) AS guardada_m,
       round(ST_Length(t.route::geography)) AS recalculada_m
FROM trips t
JOIN users u ON u.id = t.user_id
WHERE u.email = 'ana.ejemplo@ejemplo.mx';

-- 2.2 READ (Figuras 7 y 8) — listado paginado y detalle de un viaje del propio usuario
SELECT t.id, t.mode, t.status, t.started_at, t.ended_at,
       ST_NumPoints(t.route) AS puntos_traza
FROM trips t
JOIN users u ON u.id = t.user_id
WHERE u.email = 'ana.ejemplo@ejemplo.mx'
ORDER BY t.started_at DESC
LIMIT 20 OFFSET 0;

-- 2.3 UPDATE (Figuras 11 y 12) — PATCH /trips/{id}: cambio de medio BICYCLE → BUS.
--     después: mode = BUS, co2_saved_g menor, co2_emitted_g > 0, puntos recalculados y
--     updated_at posterior (el CO₂ se recalcula en el servidor, ADR-002)
SELECT t.id, t.mode, t.status, round(t.distance_m) AS distancia_m,
       round(t.co2_saved_g::numeric, 1) AS co2_evitado_g,
       round(t.co2_emitted_g::numeric, 1) AS co2_emitido_g,
       t.points AS puntos, t.created_at, t.updated_at
FROM trips t
JOIN users u ON u.id = t.user_id
WHERE u.email = 'ana.ejemplo@ejemplo.mx'
ORDER BY t.updated_at DESC
LIMIT 1;

-- 2.4 DELETE (Figuras 9 y 10) — borrado físico (datos personales, SECURITY.md §5):
--     después: el viaje eliminado ya no existe y quedan 2 viajes
SELECT count(*) AS viajes_restantes
FROM trips t
JOIN users u ON u.id = t.user_id
WHERE u.email = 'ana.ejemplo@ejemplo.mx';

-- -----------------------------------------------------------------------------
-- 3. Integridad referencial y reglas declaradas en el esquema
-- -----------------------------------------------------------------------------

-- Restricciones que protegen los datos de viajes
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'trips'::regclass
ORDER BY conname;
