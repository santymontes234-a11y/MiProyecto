-- =============================================================================
-- EcoMove Querétaro — 03_consultas.sql
-- Ejemplos de consultas SQL sobre la BD creada con 01_esquema.sql y cargada con
-- 02_datos_ejemplo.sql. Cada consulta indica qué técnica demuestra.
--
-- Uso: psql -v ON_ERROR_STOP=1 -d ecomove_abd -f database/03_consultas.sql
--
-- La sección 6 (CRUD) se ejecuta dentro de una transacción con ROLLBACK, así
-- que el script se puede correr varias veces sin alterar los datos.
-- Análisis espaciales más avanzados del módulo geo (A1–A6 y B1–B8: malla
-- hexagonal, corredores DBSCAN, población a distancia de paradas con el Censo
-- 2020): ver 04_consultas_espaciales.sql (requiere el esquema geo completo de
-- las migraciones Alembic y los datos completos de INEGI/OSM).
-- =============================================================================

\pset footer off
\echo '=== 1. Consultas con JOIN de 3 o más tablas ==='

-- Q1. JOIN de 4 tablas: viajes de cada usuario con su rol, medio y velocidad
--     máxima permitida para ese medio (detecta viajes poco plausibles).
SELECT u.full_name, r.description AS rol, t.mode, t.started_at::date AS fecha,
       round((t.distance_m / 1000)::numeric, 2) AS km,
       round((t.distance_m / 1000 / (t.duration_s / 3600.0))::numeric, 1) AS kmh,
       m.max_speed_kmh
FROM trips t
JOIN users u            ON u.id = t.user_id
JOIN roles r            ON r.name = u.role
JOIN transport_modes m  ON m.mode = t.mode
WHERE t.status = 'COMPLETED'
ORDER BY kmh DESC
LIMIT 10;

-- Q2. JOIN de 4 tablas con la especialización EER: paradas de autobús con su
--     código oficial y las líneas que pasan por ellas (N:M stop_lines).
SELECT p.name AS parada, ts.code AS codigo_oficial,
       string_agg(tl.code, ', ' ORDER BY tl.code) AS lineas
FROM pois p
JOIN transit_stops ts ON ts.poi_id = p.id AND ts.category = p.category
JOIN stop_lines sl    ON sl.stop_id = ts.poi_id
JOIN transit_lines tl ON tl.id = sl.line_id
GROUP BY p.name, ts.code
ORDER BY ts.code NULLS LAST, p.name
LIMIT 10;

-- Q3. JOIN de 3 tablas + LEFT JOIN: logros obtenidos por usuario con sus puntos
--     de bono; incluye a usuarios sin logros.
SELECT u.full_name, count(ua.id) AS logros,
       coalesce(sum(ua.bonus_points), 0) AS puntos_bono,
       string_agg(a.code, ', ' ORDER BY a.threshold) AS codigos
FROM users u
LEFT JOIN user_achievements ua ON ua.user_id = u.id
LEFT JOIN achievements a       ON a.id = ua.achievement_id
WHERE u.role = 'USER'
GROUP BY u.id, u.full_name
ORDER BY logros DESC, u.full_name;

\echo '=== 2. Agregación con GROUP BY y HAVING ==='

-- Q4. CO2 evitado por medio de transporte; HAVING aplica k-anonimato (≥ 3 usuarios).
SELECT t.mode, count(*) AS viajes, count(DISTINCT t.user_id) AS usuarios,
       round(sum(t.distance_m)::numeric / 1000, 1) AS km,
       round(sum(t.co2_saved_g)::numeric / 1000, 2) AS kg_co2_evitado
FROM trips t
WHERE t.status = 'COMPLETED'
GROUP BY t.mode
HAVING count(DISTINCT t.user_id) >= 3
ORDER BY kg_co2_evitado DESC;

-- Q5. Usuarios con al menos 5 viajes y más de 2 medios distintos.
SELECT u.email, count(*) AS viajes, count(DISTINCT t.mode) AS medios
FROM trips t JOIN users u ON u.id = t.user_id
WHERE t.status = 'COMPLETED'
GROUP BY u.email
HAVING count(*) >= 5 AND count(DISTINCT t.mode) > 2
ORDER BY viajes DESC;

-- Q6. Reportes ciudadanos por categoría y estado (tabla de contingencia con FILTER).
SELECT category,
       count(*) FILTER (WHERE status = 'OPEN')      AS abiertos,
       count(*) FILTER (WHERE status = 'IN_REVIEW') AS en_revision,
       count(*) FILTER (WHERE status = 'RESOLVED')  AS resueltos,
       count(*) FILTER (WHERE status = 'REJECTED')  AS rechazados
FROM citizen_reports
GROUP BY category
ORDER BY category;

\echo '=== 3. Subconsultas ==='

-- Q7. Subconsulta escalar: viajes cuya distancia supera el promedio de su propio medio
--     (subconsulta correlacionada).
SELECT t.id, t.mode, round(t.distance_m) AS metros
FROM trips t
WHERE t.status = 'COMPLETED'
  AND t.distance_m > (SELECT avg(t2.distance_m) FROM trips t2
                      WHERE t2.mode = t.mode AND t2.status = 'COMPLETED')
ORDER BY t.mode, metros DESC;

-- Q8. Subconsulta con NOT EXISTS: logros activos que nadie ha obtenido todavía.
SELECT a.code, a.name, a.criterion, a.threshold
FROM achievements a
WHERE a.is_active
  AND NOT EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.achievement_id = a.id);

-- Q9. Subconsulta con IN: usuarios que han usado auto compartido con 3 o más ocupantes.
SELECT full_name, email
FROM users
WHERE id IN (SELECT user_id FROM trips WHERE mode = 'CARPOOL' AND occupants >= 3)
ORDER BY full_name;

\echo '=== 4. CTE y funciones de ventana ==='

-- Q10. CTE + funciones de ventana: ranking de puntos (viajes + bonos) con RANK,
--      solo usuarios que aceptaron aparecer (ranking_opt_in); nombre abreviado.
WITH puntos AS (
    SELECT user_id, sum(points) AS pts FROM trips WHERE status = 'COMPLETED' GROUP BY user_id
    UNION ALL
    SELECT user_id, sum(bonus_points) FROM user_achievements GROUP BY user_id
), total AS (
    SELECT user_id, sum(pts) AS puntos FROM puntos GROUP BY user_id
)
SELECT rank() OVER (ORDER BY t.puntos DESC) AS posicion,
       split_part(u.full_name, ' ', 1) || ' ' || left(split_part(u.full_name, ' ', 2), 1) || '.' AS nombre,
       t.puntos
FROM total t JOIN users u ON u.id = t.user_id
WHERE u.ranking_opt_in AND u.is_active
ORDER BY posicion;

-- Q11. Funciones de ventana: acumulado de CO2 evitado por usuario a lo largo del
--      tiempo y diferencia con el viaje anterior (LAG).
SELECT u.full_name, t.started_at::date AS fecha, t.mode,
       round(t.co2_saved_g::numeric) AS co2_g,
       round(sum(t.co2_saved_g) OVER w::numeric) AS co2_acumulado_g,
       t.started_at - lag(t.started_at) OVER w AS desde_viaje_anterior
FROM trips t JOIN users u ON u.id = t.user_id
WHERE t.status = 'COMPLETED' AND u.email = 'ana.garcia@ejemplo.mx'
WINDOW w AS (PARTITION BY t.user_id ORDER BY t.started_at)
ORDER BY t.started_at;

-- Q12. CTE + date_trunc en la zona horaria de Querétaro: serie semanal de viajes
--      y participación (%) de cada medio dentro de la semana (ventana por partición).
WITH semanal AS (
    SELECT date_trunc('week', started_at AT TIME ZONE 'America/Mexico_City')::date AS semana,
           mode, count(*) AS viajes
    FROM trips WHERE status = 'COMPLETED'
    GROUP BY 1, 2
)
SELECT semana, mode, viajes,
       round(100.0 * viajes / sum(viajes) OVER (PARTITION BY semana), 1) AS pct_semana
FROM semanal
ORDER BY semana, viajes DESC
LIMIT 20;

\echo '=== 5. Consultas espaciales (PostGIS) ==='

-- Q13. ST_DWithin (geography, metros): estaciones de bicicleta a ≤ 800 m del
--      Jardín Zenea, con la distancia exacta.
SELECT p.name, bs.capacity,
       round(ST_Distance(p.location::geography,
                         ST_SetSRID(ST_MakePoint(-100.3925, 20.5925), 4326)::geography)) AS metros
FROM pois p
JOIN bike_stations bs ON bs.poi_id = p.id
WHERE ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(-100.3925, 20.5925), 4326)::geography, 800)
ORDER BY metros;

-- Q14. ST_Within: municipio en el que empieza cada viaje y CO2 evitado por municipio.
SELECT z.name AS municipio, count(*) AS viajes,
       round(sum(t.co2_saved_g)::numeric / 1000, 2) AS kg_co2_evitado
FROM trips t
JOIN geo.mobility_zones z ON ST_Within(ST_StartPoint(t.route), z.geom)
WHERE t.status = 'COMPLETED' AND NOT z.is_demo
GROUP BY z.name
ORDER BY viajes DESC;

-- Q15. ST_Intersects + ST_Length: kilómetros de ciclovía (OSM) por municipio y por cada
--      10 000 habitantes (Censo 2020).
SELECT z.name AS municipio, c.pobtot AS poblacion,
       round(sum(ST_Length(ST_Intersection(cw.geom, z.geom)::geography))::numeric / 1000, 2) AS km_ciclovia,
       round((sum(ST_Length(ST_Intersection(cw.geom, z.geom)::geography)) / 1000
              / nullif(c.pobtot, 0) * 10000)::numeric, 3) AS km_por_10mil_hab
FROM geo.mobility_zones z
JOIN geo.zone_census c ON c.zone_code = z.code
JOIN cycleways cw      ON ST_Intersects(cw.geom, z.geom)
GROUP BY z.name, c.pobtot
ORDER BY km_ciclovia DESC;

-- Q16. ST_DWithin entre tablas: viajes en bicicleta cuya ruta pasa a ≤ 25 m de una
--      ciclovía protegida (indicador de uso de infraestructura).
SELECT t.id, u.full_name, round(t.distance_m) AS metros,
       bool_or(cw.is_protected) AS cerca_de_protegida
FROM trips t
JOIN users u ON u.id = t.user_id
JOIN cycleways cw ON ST_DWithin(t.route::geography, cw.geom::geography, 25)
WHERE t.mode = 'BICYCLE'
GROUP BY t.id, u.full_name, t.distance_m
ORDER BY metros DESC;

\echo '=== 6. Vista, índice y plan de ejecución ==='

-- Q17. Vista: resumen por usuario sin datos personales sensibles (sin email ni trazas).
CREATE OR REPLACE VIEW v_resumen_usuario AS
SELECT u.id AS user_id, u.role, u.created_at::date AS alta,
       count(t.id) FILTER (WHERE t.status = 'COMPLETED') AS viajes,
       coalesce(round(sum(t.distance_m) FILTER (WHERE t.status = 'COMPLETED')::numeric / 1000, 1), 0) AS km,
       coalesce(round(sum(t.co2_saved_g) FILTER (WHERE t.status = 'COMPLETED')::numeric), 0) AS co2_evitado_g,
       coalesce(sum(t.points), 0) AS puntos_viajes
FROM users u LEFT JOIN trips t ON t.user_id = u.id
GROUP BY u.id, u.role, u.created_at;

COMMENT ON VIEW v_resumen_usuario IS 'Resumen de actividad por usuario sin email, nombre ni trazas';

SELECT * FROM v_resumen_usuario ORDER BY co2_evitado_g DESC LIMIT 5;

-- Q18. Índice + EXPLAIN: el historial de un usuario usa el índice compuesto
--      ix_trips_user_started (user_id, started_at DESC) de 01_esquema.sql.
--      Con pocas filas el planificador puede preferir Seq Scan; por eso se
--      desactiva solo para esta demostración.
SET enable_seqscan = off;
EXPLAIN (COSTS OFF)
SELECT id, mode, started_at FROM trips
WHERE user_id = (SELECT id FROM users WHERE email = 'ana.garcia@ejemplo.mx')
ORDER BY started_at DESC LIMIT 20;

-- Q19. Índice GiST espacial: búsqueda por bbox de POIs (operador &&, ix_pois_location).
EXPLAIN (COSTS OFF)
SELECT name FROM pois WHERE location && ST_MakeEnvelope(-100.42, 20.57, -100.37, 20.61, 4326);

-- Q20. Índice nuevo para un caso de consulta frecuente (reportes abiertos por categoría):
CREATE INDEX IF NOT EXISTS ix_citizen_reports_open_category
    ON citizen_reports (category, created_at DESC) WHERE status = 'OPEN';
EXPLAIN (COSTS OFF)
SELECT title FROM citizen_reports WHERE status = 'OPEN' AND category = 'SAFETY' ORDER BY created_at DESC;
RESET enable_seqscan;

\echo '=== 7. CRUD (dentro de una transacción que se revierte) ==='
BEGIN;

-- Q21. CREATE: alta de un punto de interés y de su subtipo (especialización EER).
INSERT INTO pois (id, name, category, description, attributes, location)
VALUES ('00000000-0000-4000-8000-000000000001', 'Ciclopuerto de ejemplo', 'BIKE_PARKING',
        'Creado por 03_consultas.sql', '{}'::jsonb, ST_SetSRID(ST_MakePoint(-100.3890, 20.5930), 4326));
INSERT INTO bike_stations (poi_id, category, code, capacity)
VALUES ('00000000-0000-4000-8000-000000000001', 'BIKE_PARKING', 'QB-900', 20);

-- La FK compuesta (poi_id, category) impide que un BIKE_PARKING sea también parada:
-- INSERT INTO transit_stops (poi_id, category) VALUES ('00000000-0000-4000-8000-000000000001', 'BUS_STOP');
--   → ERROR: insert or update on table "transit_stops" violates foreign key constraint

-- Q22. READ: el POI con sus atributos del subtipo.
SELECT p.name, p.category, bs.code, bs.capacity, ST_AsText(p.location) AS ubicacion
FROM pois p JOIN bike_stations bs ON bs.poi_id = p.id
WHERE p.id = '00000000-0000-4000-8000-000000000001';

-- Q23. UPDATE: ampliar la capacidad y registrar la acción en la bitácora.
UPDATE bike_stations SET capacity = 30 WHERE poi_id = '00000000-0000-4000-8000-000000000001';
INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload)
SELECT gen_random_uuid(), id, 'POI_UPDATED', 'poi', '00000000-0000-4000-8000-000000000001',
       '{"fields": ["attributes"]}'::jsonb
FROM users WHERE email = 'diego.hernandez@ejemplo.mx';

-- Q24. DELETE lógico (is_active = false) y DELETE físico de un viaje (ON DELETE CASCADE
--      no aplica a trips: es hoja). RETURNING muestra lo afectado.
UPDATE pois SET is_active = false WHERE id = '00000000-0000-4000-8000-000000000001' RETURNING name, is_active;
DELETE FROM trips
WHERE id = (SELECT id FROM trips WHERE status = 'CANCELLED' ORDER BY started_at LIMIT 1)
RETURNING id, mode, status;

ROLLBACK;
\echo 'CRUD revertido (ROLLBACK): los datos de ejemplo quedan intactos.'
