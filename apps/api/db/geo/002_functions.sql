-- =============================================================================
-- EcoMove Querétaro — Consultas geoespaciales (funciones PostGIS)
-- -----------------------------------------------------------------------------
-- Convenciones:
--   * Filtros comunes: p_from (inclusivo), p_to (exclusivo), p_modes (NULL = todos),
--     p_demo: false = SOLO datos oficiales (por defecto); true = SOLO datos DEMO.
--     Los dos conjuntos nunca se mezclan en un mismo resultado.
--   * Fuente: vistas adaptadoras geo.v_* (001_schema.sql) sobre las tablas canónicas.
--   * Modos con los valores del enum TransportMode (WALK, BICYCLE, E_SCOOTER, BUS,
--     CARPOOL, MOTORCYCLE, CAR).
--   * Entradas/salidas geográficas en EPSG:4326; cálculos métricos en EPSG:32614.
--   * Paginación por p_limit/p_offset (contrato: page/page_size) con total_count.
--   * Privacidad: toda agregación espacial devuelve solo celdas/zonas con al
--     menos p_min_users usuarios distintos (k-anonimato básico).
--   * Las funciones son STABLE y no modifican datos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Base filtrada. Función SQL de una sola sentencia => el planner la "inlinea"
-- y puede usar los índices de las tablas base en las consultas que la llaman.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.trips_filtered(
    p_from          timestamptz,
    p_to            timestamptz,
    p_modes         text[]  DEFAULT NULL,
    p_demo  boolean DEFAULT false
) RETURNS SETOF geo.v_trips
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT *
    FROM geo.v_trips t
    WHERE t.is_completed
      AND t.started_at >= p_from
      AND t.started_at <  p_to
      AND (p_modes IS NULL OR t.mode_code = ANY (p_modes))
      AND (t.is_demo = p_demo)
$$;

-- -----------------------------------------------------------------------------
-- Validación de bbox + tamaño de celda; devuelve el bbox proyectado a UTM 14N.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo._bounds_utm(
    p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8,
    p_cell_m float8, p_max_cells integer DEFAULT 200000
) RETURNS geometry
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
    v_bounds geometry;
    v_cells  float8;
BEGIN
    IF p_xmin >= p_xmax OR p_ymin >= p_ymax
       OR p_xmin < -180 OR p_xmax > 180 OR p_ymin < -90 OR p_ymax > 90 THEN
        RAISE EXCEPTION 'bbox inválido' USING ERRCODE = '22023';
    END IF;
    IF p_cell_m IS NULL OR p_cell_m < 50 OR p_cell_m > 20000 THEN
        RAISE EXCEPTION 'cell_m debe estar entre 50 y 20000 metros' USING ERRCODE = '22023';
    END IF;
    v_bounds := ST_Transform(ST_MakeEnvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326), 32614);
    v_cells  := ST_Area(v_bounds) / (p_cell_m * p_cell_m);
    IF v_cells > p_max_cells THEN
        RAISE EXCEPTION 'La consulta generaría % celdas (máximo %). Aumenta cell_m o reduce el bbox.',
            round(v_cells), p_max_cells USING ERRCODE = '54000';
    END IF;
    RETURN v_bounds;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Distancia entre puntos (geodésica, metros)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.distance_m(
    p_lon1 float8, p_lat1 float8, p_lon2 float8, p_lat2 float8
) RETURNS float8
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
    SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(p_lon1, p_lat1), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lon2, p_lat2), 4326)::geography)
$$;

-- -----------------------------------------------------------------------------
-- 2) Viajes dentro de una zona
--    p_relation: 'origin' | 'destination' | 'both' (O y D dentro) |
--                'any' (O, D o la ruta tocan la zona)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.trips_in_zone(
    p_zone_id           uuid,
    p_relation          text,
    p_from              timestamptz,
    p_to                timestamptz,
    p_modes             text[]  DEFAULT NULL,
    p_demo      boolean DEFAULT false,
    p_limit             integer DEFAULT 20,
    p_offset            integer DEFAULT 0
) RETURNS TABLE (
    trip_id             uuid,
    mode_code           text,
    started_at          timestamptz,
    distance_m          float8,
    origin_inside       boolean,
    destination_inside  boolean,
    route_intersects    boolean,
    total_count         bigint
)
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
#variable_conflict use_column
DECLARE
    v_zone geometry;
BEGIN
    IF p_relation NOT IN ('origin', 'destination', 'both', 'any') THEN
        RAISE EXCEPTION 'p_relation inválido: %', p_relation USING ERRCODE = '22023';
    END IF;
    SELECT z.geom_utm INTO v_zone FROM geo.v_zones z WHERE z.id = p_zone_id;
    IF v_zone IS NULL THEN
        RAISE EXCEPTION 'Zona % no encontrada', p_zone_id USING ERRCODE = 'P0002';
    END IF;

    -- Cada rama usa el índice GIST de la columna correspondiente.
    RETURN QUERY
    WITH candidates AS (
        SELECT t.id FROM geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
        WHERE p_relation IN ('origin', 'both', 'any') AND ST_Intersects(v_zone, t.origin_utm)
        UNION
        SELECT t.id FROM geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
        WHERE p_relation IN ('destination', 'any') AND ST_Intersects(v_zone, t.destination_utm)
        UNION
        SELECT t.id FROM geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
        WHERE p_relation = 'any' AND ST_Intersects(v_zone, t.route_utm)
    )
    SELECT t.id, t.mode_code, t.started_at, t.distance_m,
           ST_Intersects(v_zone, t.origin_utm),
           ST_Intersects(v_zone, t.destination_utm),
           COALESCE(ST_Intersects(v_zone, t.route_utm), false),
           count(*) OVER ()
    FROM candidates c
    JOIN geo.v_trips t ON t.id = c.id
    WHERE (p_relation <> 'both' OR ST_Intersects(v_zone, t.destination_utm))
    ORDER BY t.started_at DESC, t.id DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
END $$;

-- -----------------------------------------------------------------------------
-- 3) Agrupación por áreas (zonas de movilidad)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.trips_by_zone(
    p_zone_kind     text,
    p_from          timestamptz,
    p_to            timestamptz,
    p_modes         text[]  DEFAULT NULL,
    p_demo  boolean DEFAULT false,
    p_min_users     integer DEFAULT 3
) RETURNS TABLE (
    zone_id                 uuid,
    zone_code               text,
    zone_name               text,
    zone_is_demo            boolean,
    area_km2                float8,
    origins                 bigint,
    destinations            bigint,
    internal_trips          bigint,
    users                   bigint,
    sustainable_distance_m  float8,
    co2_saved_g             float8,
    trip_ends_per_km2       float8
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH z AS (
        SELECT * FROM geo.v_zones mz
        WHERE (p_zone_kind IS NULL OR mz.kind = p_zone_kind)
          AND (mz.is_demo = p_demo)
    ),
    t AS (
        SELECT f.id, f.user_id, f.distance_m, f.co2_saved_g, f.origin_utm, f.destination_utm,
               f.mode_code NOT IN ('CAR', 'MOTORCYCLE') AS is_sustainable
        FROM geo.trips_filtered(p_from, p_to, p_modes, p_demo) f
    ),
    o AS (SELECT z.id AS zone_id, t.* FROM z JOIN t ON ST_Intersects(z.geom_utm, t.origin_utm)),
    d AS (SELECT z.id AS zone_id, t.id, t.user_id FROM z JOIN t ON ST_Intersects(z.geom_utm, t.destination_utm)),
    o_agg AS (
        SELECT zone_id, count(*) AS n,
               sum(distance_m) FILTER (WHERE is_sustainable) AS sust_m,
               sum(co2_saved_g) AS co2
        FROM o GROUP BY zone_id
    ),
    d_agg AS (SELECT zone_id, count(*) AS n FROM d GROUP BY zone_id),
    i_agg AS (SELECT o.zone_id, count(*) AS n FROM o JOIN d ON d.id = o.id AND d.zone_id = o.zone_id GROUP BY o.zone_id),
    u_agg AS (
        SELECT zone_id, count(DISTINCT user_id) AS n
        FROM (SELECT zone_id, user_id FROM o UNION ALL SELECT zone_id, user_id FROM d) x
        GROUP BY zone_id
    )
    SELECT z.id, z.code, z.name, z.is_demo, z.area_km2,
           COALESCE(o_agg.n, 0), COALESCE(d_agg.n, 0), COALESCE(i_agg.n, 0),
           u_agg.n,
           COALESCE(o_agg.sust_m, 0), COALESCE(o_agg.co2, 0),
           (COALESCE(o_agg.n, 0) + COALESCE(d_agg.n, 0)) / NULLIF(z.area_km2, 0)
    FROM z
    JOIN u_agg ON u_agg.zone_id = z.id AND u_agg.n >= p_min_users
    LEFT JOIN o_agg ON o_agg.zone_id = z.id
    LEFT JOIN d_agg ON d_agg.zone_id = z.id
    LEFT JOIN i_agg ON i_agg.zone_id = z.id
    ORDER BY (COALESCE(o_agg.n, 0) + COALESCE(d_agg.n, 0)) DESC
$$;

-- -----------------------------------------------------------------------------
-- 3b) Flujos origen–destino entre zonas (líneas de deseo)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.od_flows(
    p_zone_kind     text,
    p_from          timestamptz,
    p_to            timestamptz,
    p_modes         text[]  DEFAULT NULL,
    p_demo  boolean DEFAULT false,
    p_min_users     integer DEFAULT 3,
    p_limit         integer DEFAULT 200
) RETURNS TABLE (
    origin_zone_id       uuid,
    origin_zone_name     text,
    destination_zone_id  uuid,
    destination_zone_name text,
    trips                bigint,
    users                bigint,
    avg_distance_m       float8,
    geom                 geometry
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT oz.id, oz.name, dz.id, dz.name,
           count(*), count(DISTINCT t.user_id), avg(t.distance_m),
           ST_MakeLine(ST_PointOnSurface(oz.geom), ST_PointOnSurface(dz.geom))
    FROM geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
    JOIN geo.v_zones oz ON ST_Intersects(oz.geom_utm, t.origin_utm)
    JOIN geo.v_zones dz ON ST_Intersects(dz.geom_utm, t.destination_utm)
    WHERE (p_zone_kind IS NULL OR (oz.kind = p_zone_kind AND dz.kind = p_zone_kind))
      AND (oz.is_demo = p_demo AND dz.is_demo = p_demo)
    GROUP BY oz.id, oz.name, oz.geom, dz.id, dz.name, dz.geom
    HAVING count(DISTINCT t.user_id) >= p_min_users
    ORDER BY count(*) DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 2000)
$$;

-- -----------------------------------------------------------------------------
-- 4) Intersección de rutas
-- 4a) Viajes cuya ruta cruza una geometría (línea o polígono) con tolerancia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.trips_crossing(
    p_geom              geometry,   -- EPSG:4326
    p_buffer_m          float8,
    p_from              timestamptz,
    p_to                timestamptz,
    p_modes             text[]  DEFAULT NULL,
    p_demo      boolean DEFAULT false,
    p_limit             integer DEFAULT 20,
    p_offset            integer DEFAULT 0
) RETURNS TABLE (
    trip_id         uuid,
    mode_code       text,
    started_at      timestamptz,
    distance_m      float8,
    length_inside_m float8,
    total_count     bigint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH g AS (
        SELECT ST_Buffer(ST_Transform(ST_SetSRID(p_geom, 4326), 32614),
                         GREATEST(COALESCE(p_buffer_m, 0), 0)) AS g
    )
    SELECT t.id, t.mode_code, t.started_at, t.distance_m,
           ST_Length(ST_Intersection(t.route_utm, g.g)),
           count(*) OVER ()
    FROM g
    JOIN geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
      ON ST_Intersects(t.route_utm, g.g)
    ORDER BY t.started_at DESC, t.id DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0)
$$;

-- 4b) Superposición entre dos rutas (longitud compartida y cruces)
CREATE OR REPLACE FUNCTION geo.route_overlap(
    p_trip_a uuid, p_trip_b uuid, p_tolerance_m float8 DEFAULT 15
) RETURNS TABLE (
    intersects       boolean,
    crossing_points  integer,
    shared_m         float8,
    share_of_a       float8,
    share_of_b       float8
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT ST_Intersects(a.route_utm, b.route_utm),
           ST_NumGeometries(ST_CollectionExtract(ST_Intersection(a.route_utm, b.route_utm), 1)),
           ST_Length(ST_Intersection(a.route_utm, ST_Buffer(b.route_utm, p_tolerance_m))),
           ST_Length(ST_Intersection(a.route_utm, ST_Buffer(b.route_utm, p_tolerance_m)))
               / NULLIF(ST_Length(a.route_utm), 0),
           ST_Length(ST_Intersection(b.route_utm, ST_Buffer(a.route_utm, p_tolerance_m)))
               / NULLIF(ST_Length(b.route_utm), 0)
    FROM geo.v_trips a, geo.v_trips b
    WHERE a.id = p_trip_a AND b.id = p_trip_b
      AND a.route_utm IS NOT NULL AND b.route_utm IS NOT NULL
$$;

-- 4c) Proporción de kilómetros recorridos sobre ciclovías (por medio)
--     El buffer se une y subdivide una sola vez para que el join use GIST.
CREATE OR REPLACE FUNCTION geo.bike_lane_coverage(
    p_buffer_m      float8,
    p_from          timestamptz,
    p_to            timestamptz,
    p_modes         text[]  DEFAULT NULL,
    p_demo  boolean DEFAULT false
) RETURNS TABLE (
    mode_code           text,
    trips_with_route    bigint,
    route_km            float8,
    km_on_bike_lanes    float8,
    share_on_bike_lanes float8
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH lanes AS (
        SELECT ST_Subdivide(ST_Union(ST_Buffer(bl.geom_utm, p_buffer_m)), 128) AS g
        FROM geo.v_bike_lanes bl
        WHERE bl.is_demo = p_demo
    ),
    t AS (
        SELECT f.id, f.mode_code, f.route_utm
        FROM geo.trips_filtered(p_from, p_to, p_modes, p_demo) f
        WHERE f.route_utm IS NOT NULL
    ),
    on_lane AS (
        SELECT t.id, sum(ST_Length(ST_Intersection(t.route_utm, l.g))) AS m
        FROM t JOIN lanes l ON ST_Intersects(t.route_utm, l.g)
        GROUP BY t.id
    )
    SELECT t.mode_code, count(*),
           sum(ST_Length(t.route_utm)) / 1000,
           COALESCE(sum(on_lane.m), 0) / 1000,
           COALESCE(sum(on_lane.m), 0) / NULLIF(sum(ST_Length(t.route_utm)), 0)
    FROM t LEFT JOIN on_lane ON on_lane.id = t.id
    GROUP BY t.mode_code
    ORDER BY 3 DESC
$$;

-- -----------------------------------------------------------------------------
-- 5) Conteo de viajes por cuadrícula (cuadrada o hexagonal)
--    p_metric: 'origin' | 'destination' | 'route'
--    Nota: un punto exactamente sobre el borde de dos celdas cuenta en ambas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.grid_counts(
    p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8,
    p_cell_m        float8,
    p_metric        text,
    p_shape         text,
    p_from          timestamptz,
    p_to            timestamptz,
    p_modes         text[]  DEFAULT NULL,
    p_demo  boolean DEFAULT false,
    p_min_users     integer DEFAULT 3
) RETURNS TABLE (
    cell_i          integer,
    cell_j          integer,
    geom            geometry,
    trips           bigint,
    users           bigint,
    co2_saved_g     float8
)
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
    v_col    text;
    v_grid   text;
    v_bounds geometry;
BEGIN
    v_col := CASE p_metric
        WHEN 'origin'      THEN 'origin_utm'
        WHEN 'destination' THEN 'destination_utm'
        WHEN 'route'       THEN 'route_utm'
    END;
    v_grid := CASE p_shape WHEN 'square' THEN 'ST_SquareGrid' WHEN 'hex' THEN 'ST_HexagonGrid' END;
    IF v_col IS NULL OR v_grid IS NULL THEN
        RAISE EXCEPTION 'p_metric/p_shape inválidos: %/%', p_metric, p_shape USING ERRCODE = '22023';
    END IF;
    v_bounds := geo._bounds_utm(p_xmin, p_ymin, p_xmax, p_ymax, p_cell_m);

    -- Identificadores interpolados solo desde listas blancas (sin inyección).
    RETURN QUERY EXECUTE format($q$
        SELECT g.i, g.j, ST_Transform(g.geom, 4326), a.trips, a.users, a.co2
        FROM %s($1, $2) AS g
        CROSS JOIN LATERAL (
            SELECT count(*)::bigint                 AS trips,
                   count(DISTINCT t.user_id)::bigint AS users,
                   sum(t.co2_saved_g)                AS co2
            FROM geo.trips_filtered($3, $4, $5, $6) t
            WHERE ST_Intersects(g.geom, t.%I)
        ) a
        WHERE a.users >= $7
    $q$, v_grid, v_col)
    USING p_cell_m, v_bounds, p_from, p_to, p_modes, p_demo, p_min_users;
END $$;

-- 5b) Densidad de puntos para mapa de calor (agregación aritmética, O(n)).
--     Devuelve centroides de celda con peso; nunca coordenadas individuales.
CREATE OR REPLACE FUNCTION geo.point_density(
    p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8,
    p_cell_m        float8,
    p_point         text,       -- 'origin' | 'destination' | 'both'
    p_from          timestamptz,
    p_to            timestamptz,
    p_modes         text[]  DEFAULT NULL,
    p_demo  boolean DEFAULT false,
    p_min_users     integer DEFAULT 3
) RETURNS TABLE (lon float8, lat float8, weight bigint, users bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH b AS (SELECT geo._bounds_utm(p_xmin, p_ymin, p_xmax, p_ymax, p_cell_m, 2000000) AS g),
    pts AS (
        SELECT t.user_id, t.origin_utm AS p
        FROM b, geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
        WHERE p_point IN ('origin', 'both') AND t.origin_utm && b.g
        UNION ALL
        SELECT t.user_id, t.destination_utm
        FROM b, geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
        WHERE p_point IN ('destination', 'both') AND t.destination_utm && b.g
    ),
    cells AS (
        SELECT floor(ST_X(p) / p_cell_m)::int AS i,
               floor(ST_Y(p) / p_cell_m)::int AS j,
               count(*) AS n,
               count(DISTINCT user_id) AS u
        FROM pts GROUP BY 1, 2
        HAVING count(DISTINCT user_id) >= p_min_users
    ),
    c AS (
        SELECT ST_Transform(ST_SetSRID(ST_MakePoint((i + 0.5) * p_cell_m, (j + 0.5) * p_cell_m), 32614), 4326) AS pt,
               n, u
        FROM cells
    )
    SELECT ST_X(pt), ST_Y(pt), n, u FROM c
$$;

-- -----------------------------------------------------------------------------
-- 6) Corredores de movilidad
--    Celdas atravesadas por rutas con densidad >= cuantil p_quantile, con
--    k-anonimato, agrupadas por contigüidad (ST_ClusterDBSCAN, eps = 1 m).
--    Un corredor es un conjunto de >= p_min_cells celdas contiguas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.mobility_corridors(
    p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8,
    p_cell_m        float8,
    p_quantile      float8,
    p_from          timestamptz,
    p_to            timestamptz,
    p_modes         text[]  DEFAULT NULL,
    p_demo  boolean DEFAULT false,
    p_min_users     integer DEFAULT 3,
    p_min_cells     integer DEFAULT 3
) RETURNS TABLE (
    corridor_id     integer,
    geom            geometry,
    cells           integer,
    trips           bigint,
    users           bigint,
    max_cell_trips  bigint,
    span_m          float8,
    elongation      float8,
    modes           jsonb
)
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
#variable_conflict use_column
DECLARE
    v_bounds geometry;
BEGIN
    IF p_quantile <= 0 OR p_quantile >= 1 THEN
        RAISE EXCEPTION 'p_quantile debe estar en (0,1)' USING ERRCODE = '22023';
    END IF;
    v_bounds := geo._bounds_utm(p_xmin, p_ymin, p_xmax, p_ymax, p_cell_m);

    RETURN QUERY
    WITH grid AS (
        SELECT g.i, g.j, g.geom FROM ST_SquareGrid(p_cell_m, v_bounds) g
    ),
    cell_trips AS (
        SELECT g.i, g.j, g.geom, t.id AS trip_id, t.user_id, t.mode_code
        FROM grid g
        JOIN geo.trips_filtered(p_from, p_to, p_modes, p_demo) t
          ON ST_Intersects(g.geom, t.route_utm)
    ),
    cell_counts AS (
        SELECT i, j, geom, count(DISTINCT trip_id) AS n, count(DISTINCT user_id) AS u
        FROM cell_trips GROUP BY i, j, geom
    ),
    thr AS (
        SELECT percentile_cont(p_quantile) WITHIN GROUP (ORDER BY n) AS v FROM cell_counts
    ),
    hot AS (
        SELECT cc.* FROM cell_counts cc, thr WHERE cc.n >= thr.v AND cc.u >= p_min_users
    ),
    clustered AS (
        SELECT h.*, ST_ClusterDBSCAN(h.geom, eps := 1, minpoints := 1) OVER () AS cid FROM hot h
    ),
    corridor_trips AS (
        SELECT cl.cid, ct.trip_id, ct.user_id, ct.mode_code
        FROM clustered cl JOIN cell_trips ct ON ct.i = cl.i AND ct.j = cl.j
    ),
    per_mode AS (
        SELECT cid, mode_code, count(DISTINCT trip_id) AS n FROM corridor_trips GROUP BY cid, mode_code
    ),
    shape AS (
        SELECT cid, ST_Union(geom) AS g, count(*)::int AS ncells, max(n) AS maxn
        FROM clustered GROUP BY cid HAVING count(*) >= p_min_cells
    )
    SELECT s.cid,
           ST_Transform(s.g, 4326),
           s.ncells,
           (SELECT count(DISTINCT trip_id) FROM corridor_trips c WHERE c.cid = s.cid),
           (SELECT count(DISTINCT user_id) FROM corridor_trips c WHERE c.cid = s.cid),
           s.maxn,
           ST_Length(ST_LongestLine(s.g, s.g)),
           ST_Length(ST_LongestLine(s.g, s.g)) / NULLIF(sqrt(ST_Area(s.g)), 0),
           (SELECT jsonb_object_agg(pm.mode_code, pm.n) FROM per_mode pm WHERE pm.cid = s.cid)
    FROM shape s
    ORDER BY 4 DESC;
END $$;

-- -----------------------------------------------------------------------------
-- 7) Entradas para el índice de prioridad de infraestructura
--    Devuelve observaciones crudas por celda; el puntaje se calcula en la API
--    (apps/api/app/services/geo_analytics/priority_index.py) para que sea configurable y explicable.
--    Distancias: búsqueda acotada con ST_DWithin (usa el índice de expresión);
--    si no hay nada en 3000 m se devuelve 3000 (= "3000 m o más").
--    NULL = la capa completa está vacía: no hay datos (NO equivale a "lejos").
--    (No se usa KNN `<->`: a través de vistas UNION ALL dispara el error del
--    planner "could not find pathkey item to sort".)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo.priority_inputs(
    p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8,
    p_cell_m        float8,
    p_from          timestamptz,
    p_to            timestamptz,
    p_demo  boolean DEFAULT false,
    p_short_trip_m  float8  DEFAULT 5000
) RETURNS TABLE (
    cell_i                  integer,
    cell_j                  integer,
    geom                    geometry,
    zone_name               text,
    users                   bigint,
    trip_ends               bigint,
    bike_like_ends          bigint,
    walk_ends               bigint,
    bus_ends                bigint,
    short_car_ends          bigint,
    bike_like_route_trips   bigint,
    walk_route_trips        bigint,
    bus_route_trips         bigint,
    dist_bike_lane_m        float8,
    dist_bike_station_m     float8,
    dist_bus_stop_m         float8
)
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
#variable_conflict use_column
DECLARE
    c_cap      constant float8 := 3000;
    v_bounds   geometry;
    v_lanes    boolean;
    v_bike_st  boolean;
    v_bus_st   boolean;
BEGIN
    v_bounds  := geo._bounds_utm(p_xmin, p_ymin, p_xmax, p_ymax, p_cell_m, 50000);
    v_lanes   := EXISTS (SELECT 1 FROM geo.v_bike_lanes WHERE is_demo = p_demo);
    v_bike_st := EXISTS (SELECT 1 FROM geo.v_stations WHERE kind = 'bike_station' AND (is_demo = p_demo));
    v_bus_st  := EXISTS (SELECT 1 FROM geo.v_stations WHERE kind = 'bus_stop' AND (is_demo = p_demo));

    RETURN QUERY
    WITH grid AS (
        SELECT g.i, g.j, g.geom, ST_Centroid(g.geom) AS ctr FROM ST_SquareGrid(p_cell_m, v_bounds) g
    ),
    ends AS (
        SELECT g.i, g.j, t.user_id, t.mode_code, t.distance_m
        FROM grid g JOIN geo.trips_filtered(p_from, p_to, NULL, p_demo) t
          ON ST_Intersects(g.geom, t.origin_utm)
        UNION ALL
        SELECT g.i, g.j, t.user_id, t.mode_code, t.distance_m
        FROM grid g JOIN geo.trips_filtered(p_from, p_to, NULL, p_demo) t
          ON ST_Intersects(g.geom, t.destination_utm)
    ),
    rts AS (
        SELECT g.i, g.j, t.id, t.user_id, t.mode_code
        FROM grid g JOIN geo.trips_filtered(p_from, p_to, NULL, p_demo) t
          ON ST_Intersects(g.geom, t.route_utm)
    ),
    e_agg AS (
        SELECT i, j,
               count(*) AS n,
               count(*) FILTER (WHERE mode_code IN ('BICYCLE', 'E_SCOOTER', 'E_BIKE')) AS bike_like,
               count(*) FILTER (WHERE mode_code = 'WALK') AS walk,
               count(*) FILTER (WHERE mode_code IN ('BUS', 'BRT')) AS bus,
               count(*) FILTER (WHERE mode_code IN ('CAR', 'MOTORCYCLE') AND distance_m < p_short_trip_m) AS short_car
        FROM ends GROUP BY i, j
    ),
    r_agg AS (
        SELECT i, j,
               count(DISTINCT id) FILTER (WHERE mode_code IN ('BICYCLE', 'E_SCOOTER', 'E_BIKE')) AS bike_like,
               count(DISTINCT id) FILTER (WHERE mode_code = 'WALK') AS walk,
               count(DISTINCT id) FILTER (WHERE mode_code IN ('BUS', 'BRT')) AS bus
        FROM rts GROUP BY i, j
    ),
    u_agg AS (
        SELECT i, j, count(DISTINCT user_id) AS u
        FROM (SELECT i, j, user_id FROM ends UNION ALL SELECT i, j, user_id FROM rts) x
        GROUP BY i, j
    )
    SELECT g.i, g.j, ST_Transform(g.geom, 4326),
           (SELECT z.name FROM geo.v_zones z
             WHERE ST_Intersects(z.geom_utm, g.ctr) AND (z.is_demo = p_demo) LIMIT 1),
           u.u,
           COALESCE(e.n, 0), COALESCE(e.bike_like, 0), COALESCE(e.walk, 0),
           COALESCE(e.bus, 0), COALESCE(e.short_car, 0),
           COALESCE(r.bike_like, 0), COALESCE(r.walk, 0), COALESCE(r.bus, 0),
           CASE WHEN v_lanes THEN COALESCE(
               (SELECT min(ST_Distance(g.ctr, bl.geom_utm)) FROM geo.v_bike_lanes bl
                 WHERE ST_DWithin(bl.geom_utm, g.ctr, c_cap) AND (bl.is_demo = p_demo)), c_cap) END,
           CASE WHEN v_bike_st THEN COALESCE(
               (SELECT min(ST_Distance(g.ctr, s.geom_utm)) FROM geo.v_stations s
                 WHERE ST_DWithin(s.geom_utm, g.ctr, c_cap) AND s.kind = 'bike_station'
                   AND (s.is_demo = p_demo)), c_cap) END,
           CASE WHEN v_bus_st THEN COALESCE(
               (SELECT min(ST_Distance(g.ctr, s.geom_utm)) FROM geo.v_stations s
                 WHERE ST_DWithin(s.geom_utm, g.ctr, c_cap) AND s.kind = 'bus_stop'
                   AND (s.is_demo = p_demo)), c_cap) END
    FROM grid g
    JOIN u_agg u ON u.i = g.i AND u.j = g.j
    LEFT JOIN e_agg e ON e.i = g.i AND e.j = g.j
    LEFT JOIN r_agg r ON r.i = g.i AND r.j = g.j;
END $$;

