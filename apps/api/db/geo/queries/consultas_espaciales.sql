-- =============================================================================
-- EcoMove Querétaro · Consultas espaciales (PostGIS) para database/03_consultas.sql
-- Autor: módulo geo. Las integra Backend (rol database).
--
-- Convenciones:
--   * Almacenamiento en EPSG:4326; medidas en metros sobre UTM 14N (EPSG:32614),
--     usando las columnas/índices *_utm. ::geography solo para longitudes globales.
--   * geo.v_* son vistas adaptadoras sobre las tablas canónicas (trips, cycleways, pois)
--     y las tablas DEMO; toda consulta oficial filtra NOT is_demo.
--   * Zonas y población: INEGI, Marco Geoestadístico 2020 (geo.mobility_zones,
--     source 'INEGI-MG-2020') y Censo 2020 (geo.zone_census, 'INEGI-CPV-2020').
--   * Infraestructura: OpenStreetMap (© OpenStreetMap contributors, ODbL), importada
--     solo dentro del bbox (-100.62, 20.40) – (-100.15, 20.85).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A. Consultas sobre viajes (las funciones viven en db/geo/002_functions.sql)
-- -----------------------------------------------------------------------------

-- A1. Distancia geodésica entre dos puntos (m): Jardín Zenea → Estadio Corregidora.
SELECT geo.distance_m(-100.3928, 20.5926, -100.4479, 20.5770) AS distancia_m;

-- A2. Viajes completados que empiezan o terminan dentro de una zona (paginado).
--     ST_Intersects sobre geom_utm aprovecha los índices GiST de expresión.
SELECT t.id, t.mode_code, t.started_at, t.distance_m,
       ST_Intersects(t.origin_utm, z.geom_utm) AS sale_de_la_zona,
       ST_Intersects(t.destination_utm,   z.geom_utm) AS llega_a_la_zona
FROM geo.mobility_zones z
JOIN geo.v_trips t
  ON NOT t.is_demo AND t.is_completed
 AND (ST_Intersects(t.origin_utm, z.geom_utm) OR ST_Intersects(t.destination_utm, z.geom_utm))
WHERE z.code = '22014'                       -- municipio de Querétaro
ORDER BY t.started_at DESC
LIMIT 50 OFFSET 0;

-- A3. Viajes por zona (agrupación por área) con k-anonimato: se ocultan zonas con
--     menos de 5 usuarios distintos.
SELECT z.code, z.name, count(*) AS viajes, count(DISTINCT t.user_id) AS usuarios
FROM geo.mobility_zones z
JOIN geo.v_trips t ON NOT t.is_demo AND t.is_completed
                  AND ST_Intersects(t.origin_utm, z.geom_utm)
WHERE z.kind = 'ageb' AND NOT z.is_demo
GROUP BY z.code, z.name
HAVING count(DISTINCT t.user_id) >= 5
ORDER BY viajes DESC;

-- A4. Rutas que se intersecan con una ciclovía y metros compartidos (tolerancia 15 m).
--     Se unen primero los buffers de las ciclovías cercanas para no contar dos veces.
SELECT t.id, t.mode_code, round(t.distance_m) AS m_viaje,
       round(ST_Length(ST_Intersection(t.route_utm, ST_Union(ST_Buffer(b.geom_utm, 15))))) AS m_sobre_ciclovia
FROM geo.v_trips t
JOIN geo.v_bike_lanes b ON NOT b.is_demo AND ST_DWithin(t.route_utm, b.geom_utm, 15)
WHERE NOT t.is_demo AND t.is_completed AND t.route_utm IS NOT NULL
GROUP BY t.id, t.mode_code, t.distance_m, t.route_utm
ORDER BY m_sobre_ciclovia DESC
LIMIT 20;

-- A5. Conteo en malla hexagonal de 500 m (orígenes de viaje) en el municipio de Querétaro.
SELECT h.i, h.j, count(t.*) AS origenes, ST_AsGeoJSON(ST_Transform(h.geom, 4326)) AS celda
FROM geo.mobility_zones z
CROSS JOIN LATERAL ST_HexagonGrid(500, z.geom_utm) h
JOIN geo.v_trips t ON NOT t.is_demo AND t.is_completed AND ST_Intersects(t.origin_utm, h.geom)
WHERE z.code = '22014'
GROUP BY h.i, h.j, h.geom
HAVING count(DISTINCT t.user_id) >= 5;

-- A6. Corredores de movilidad: agrupa rutas cercanas (≤ 150 m) con ST_ClusterDBSCAN.
SELECT cluster_id, count(*) AS viajes,
       ST_AsGeoJSON(ST_Transform(ST_LineMerge(ST_Union(route_utm)), 4326)) AS corredor
FROM (
    SELECT t.route_utm,
           ST_ClusterDBSCAN(t.route_utm, eps => 150, minpoints => 5) OVER () AS cluster_id
    FROM geo.v_trips t
    WHERE NOT t.is_demo AND t.is_completed AND t.route_utm IS NOT NULL
) c
WHERE cluster_id IS NOT NULL
GROUP BY cluster_id
ORDER BY viajes DESC;


-- -----------------------------------------------------------------------------
-- B. Análisis de necesidad con datos oficiales (resultados en
--    docs/report/ANALISIS_DATOS.md). Área de estudio: AGEB urbanas del Censo 2020
--    contenidas por completo en el bbox importado de OSM.
-- -----------------------------------------------------------------------------

-- B1. Control de carga: la población de los 18 municipios debe sumar el total estatal
--     publicado por INEGI (2 368 467).
SELECT count(*) AS municipios, sum(c.pobtot) AS poblacion
FROM geo.mobility_zones z
JOIN geo.zone_census c ON c.zone_code = z.code AND c.source = 'INEGI-CPV-2020'
WHERE z.kind = 'municipio';

-- B2. Área de estudio por municipio: AGEB urbanas dentro del bbox, población y densidad.
WITH bbox AS (SELECT ST_MakeEnvelope(-100.62, 20.40, -100.15, 20.85, 4326) AS g),
area AS (
    SELECT z.code, substr(z.code, 1, 5) AS mun, z.geom_utm, z.area_km2, c.pobtot
    FROM geo.mobility_zones z
    JOIN geo.zone_census c ON c.zone_code = z.code AND c.source = 'INEGI-CPV-2020'
    CROSS JOIN bbox
    WHERE z.kind = 'ageb' AND ST_Within(z.geom, bbox.g)
)
SELECT m.name AS municipio, count(*) AS ageb, sum(a.pobtot) AS poblacion_urbana,
       round(sum(a.area_km2)::numeric, 1) AS km2,
       round((sum(a.pobtot) / sum(a.area_km2))::numeric) AS hab_km2
FROM area a JOIN geo.mobility_zones m ON m.code = a.mun
GROUP BY m.name ORDER BY poblacion_urbana DESC;

-- B3. Kilómetros de ciclovía por municipio y por cada 10 000 habitantes urbanos.
--     ST_Intersection recorta cada ciclovía al municipio (no se cuenta dos veces).
WITH bbox AS (SELECT ST_Transform(ST_MakeEnvelope(-100.62, 20.40, -100.15, 20.85, 4326), 32614) AS g),
pob AS (
    SELECT substr(z.code, 1, 5) AS mun, sum(c.pobtot) AS pob
    FROM geo.mobility_zones z
    JOIN geo.zone_census c ON c.zone_code = z.code AND c.source = 'INEGI-CPV-2020'
    WHERE z.kind = 'ageb' AND ST_Within(z.geom_utm, (SELECT g FROM bbox))
    GROUP BY 1
),
cic AS (
    SELECT m.code AS mun,
           sum(ST_Length(ST_Intersection(b.geom_utm, m.geom_utm))) / 1000 AS km,
           sum(ST_Length(ST_Intersection(b.geom_utm, m.geom_utm)))
               FILTER (WHERE b.is_protected) / 1000 AS km_confinada
    FROM geo.mobility_zones m
    JOIN geo.v_bike_lanes b ON NOT b.is_demo AND ST_Intersects(b.geom_utm, m.geom_utm)
    WHERE m.kind = 'municipio'
    GROUP BY m.code
)
SELECT m.name AS municipio, p.pob AS poblacion_urbana,
       round(COALESCE(c.km, 0)::numeric, 1) AS km_ciclovia,
       round(COALESCE(c.km_confinada, 0)::numeric, 1) AS km_confinada,
       round((COALESCE(c.km, 0) * 10000 / p.pob)::numeric, 2) AS km_por_10k_hab
FROM pob p
JOIN geo.mobility_zones m ON m.code = p.mun
LEFT JOIN cic c ON c.mun = p.mun
ORDER BY p.pob DESC;

-- B4. (≈ 2 min en la BD de desarrollo: une ~900 buffers) Población urbana a ≤ 400 m de una parada de autobús y a ≤ 300 m de una ciclovía.
--     Interpolación areal: población de la AGEB × fracción de su área cubierta
--     (supone población uniforme dentro de la AGEB).
WITH bbox AS (SELECT ST_Transform(ST_MakeEnvelope(-100.62, 20.40, -100.15, 20.85, 4326), 32614) AS g),
ageb AS (
    SELECT z.code, substr(z.code, 1, 5) AS mun, z.geom_utm, c.pobtot
    FROM geo.mobility_zones z
    JOIN geo.zone_census c ON c.zone_code = z.code AND c.source = 'INEGI-CPV-2020'
    WHERE z.kind = 'ageb' AND ST_Within(z.geom_utm, (SELECT g FROM bbox))
),
paradas AS (
    SELECT ST_Union(ST_Buffer(s.geom_utm, 400, 16)) AS g
    FROM geo.v_stations s WHERE NOT s.is_demo AND s.kind = 'bus_stop'
),
ciclo AS (
    SELECT ST_Union(ST_Buffer(b.geom_utm, 300, 8)) AS g
    FROM geo.v_bike_lanes b WHERE NOT b.is_demo
),
cob AS (
    SELECT a.code, a.mun, a.pobtot,
           ST_Area(ST_Intersection(a.geom_utm, p.g)) / ST_Area(a.geom_utm) AS f_parada,
           ST_Area(ST_Intersection(a.geom_utm, c.g)) / ST_Area(a.geom_utm) AS f_ciclo
    FROM ageb a CROSS JOIN paradas p CROSS JOIN ciclo c
)
SELECT COALESCE(m.name, 'Área de estudio') AS municipio,
       sum(pobtot) AS poblacion_urbana,
       round(sum(pobtot * f_parada)::numeric) AS pob_400m_parada,
       round((100 * sum(pobtot * f_parada) / sum(pobtot))::numeric, 1) AS pct_parada,
       round(sum(pobtot * f_ciclo)::numeric) AS pob_300m_ciclovia,
       round((100 * sum(pobtot * f_ciclo) / sum(pobtot))::numeric, 1) AS pct_ciclovia
FROM cob LEFT JOIN geo.mobility_zones m ON m.code = cob.mun
GROUP BY ROLLUP (m.name)
ORDER BY sum(pobtot) DESC;

-- B5. Viviendas con bicicleta, automóvil y motocicleta (Censo 2020), total municipal.
--     Las AGEB con valores confidenciales (NULL) se excluyen del numerador y del
--     denominador de cada indicador.
SELECT m.name AS municipio,
       sum(c.tvivparhab) AS viviendas,
       round(100.0 * sum(c.vph_bici)  FILTER (WHERE c.vph_bici  IS NOT NULL)
                    / NULLIF(sum(c.tvivparhab) FILTER (WHERE c.vph_bici  IS NOT NULL), 0), 1) AS pct_bici,
       round(100.0 * sum(c.vph_autom) FILTER (WHERE c.vph_autom IS NOT NULL)
                    / NULLIF(sum(c.tvivparhab) FILTER (WHERE c.vph_autom IS NOT NULL), 0), 1) AS pct_auto,
       round(100.0 * sum(c.vph_moto)  FILTER (WHERE c.vph_moto  IS NOT NULL)
                    / NULLIF(sum(c.tvivparhab) FILTER (WHERE c.vph_moto  IS NOT NULL), 0), 1) AS pct_moto
FROM geo.mobility_zones m
JOIN geo.zone_census c ON c.zone_code = m.code AND c.source = 'INEGI-CPV-2020'
WHERE m.kind = 'municipio' AND m.code IN ('22014', '22006', '22011', '22008', '22012')
GROUP BY m.name
ORDER BY sum(c.tvivparhab) DESC;

-- B6. AGEB urbanas candidatas a estudio: densidad ≥ percentil 75 del área de estudio,
--     sin ciclovía a ≤ 500 m y con distancia a la parada más cercana. Es oferta contra
--     población; NO incluye demanda observada (ver limitaciones en el informe).
WITH bbox AS (SELECT ST_Transform(ST_MakeEnvelope(-100.62, 20.40, -100.15, 20.85, 4326), 32614) AS g),
ageb AS (
    SELECT z.code, z.geom_utm, c.pobtot, c.pobtot / z.area_km2 AS dens
    FROM geo.mobility_zones z
    JOIN geo.zone_census c ON c.zone_code = z.code AND c.source = 'INEGI-CPV-2020'
    WHERE z.kind = 'ageb' AND ST_Within(z.geom_utm, (SELECT g FROM bbox)) AND c.pobtot > 0
),
p75 AS (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY dens) AS v FROM ageb)
SELECT a.code AS cvegeo, m.name AS municipio, a.pobtot AS poblacion,
       round(a.dens::numeric) AS hab_km2,
       round(d.m::numeric) AS m_a_parada   -- 0 = hay una parada dentro de la AGEB
FROM ageb a
JOIN geo.mobility_zones m ON m.code = substr(a.code, 1, 5)
CROSS JOIN p75
CROSS JOIN LATERAL (
    SELECT min(ST_Distance(a.geom_utm, s.geom_utm)) AS m
    FROM geo.v_stations s
    WHERE NOT s.is_demo AND s.kind = 'bus_stop' AND ST_DWithin(a.geom_utm, s.geom_utm, 3000)
) d
WHERE a.dens >= p75.v
  AND NOT EXISTS (SELECT 1 FROM geo.v_bike_lanes b
                  WHERE NOT b.is_demo AND ST_DWithin(a.geom_utm, b.geom_utm, 500))
ORDER BY a.pobtot DESC
LIMIT 15;

-- B7. Cuántas AGEB densas quedan sin ciclovía a ≤ 500 m (resumen de B6).
WITH bbox AS (SELECT ST_Transform(ST_MakeEnvelope(-100.62, 20.40, -100.15, 20.85, 4326), 32614) AS g),
ageb AS (
    SELECT z.code, z.geom_utm, c.pobtot, c.pobtot / z.area_km2 AS dens
    FROM geo.mobility_zones z
    JOIN geo.zone_census c ON c.zone_code = z.code AND c.source = 'INEGI-CPV-2020'
    WHERE z.kind = 'ageb' AND ST_Within(z.geom_utm, (SELECT g FROM bbox)) AND c.pobtot > 0
),
p75 AS (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY dens) AS v FROM ageb),
densas AS (SELECT a.* FROM ageb a, p75 WHERE a.dens >= p75.v)
SELECT round(p75.v::numeric) AS umbral_hab_km2,
       count(*) AS ageb_densas,
       sum(pobtot) AS poblacion_densas,
       count(*) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM geo.v_bike_lanes b
           WHERE NOT b.is_demo AND ST_DWithin(d.geom_utm, b.geom_utm, 500))) AS sin_ciclovia_500m,
       sum(pobtot) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM geo.v_bike_lanes b
           WHERE NOT b.is_demo AND ST_DWithin(d.geom_utm, b.geom_utm, 500))) AS pob_sin_ciclovia_500m
FROM densas d CROSS JOIN p75
GROUP BY p75.v;

-- B8. Muestra de viajes oficiales disponible (determina si el índice de prioridad
--     puede usar demanda observada).
SELECT count(*) AS viajes, count(DISTINCT user_id) AS usuarios,
       min(started_at) AS desde, max(started_at) AS hasta
FROM geo.v_trips WHERE NOT is_demo AND is_completed;
