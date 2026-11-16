-- =============================================================================
-- ⚠️  DATOS DEMO — SINTÉTICOS. NO REPRESENTAN MOVILIDAD REAL DE QUERÉTARO. ⚠️
-- -----------------------------------------------------------------------------
-- NO es una migración: solo para desarrollo y pruebas. No ejecutar en producción.
--
-- Escribe EXCLUSIVAMENTE en tablas aisladas (geo.demo_trips, geo.demo_bike_lanes,
-- geo.demo_stations) y en geo.mobility_zones con source = 'DEMO'. Nunca toca
-- public.trips, cycleways ni pois, así que /stats/city y /admin/stats/overview
-- (que leen public.*) jamás ven estos datos. En el módulo geo solo aparecen con
-- dataset=demo (excluyente) y las respuestas lo marcan con meta.is_demo.
--
-- Zonas, ciclovías y estaciones son figuras geométricas ficticias alrededor de
-- un punto cercano al centro de Querétaro, únicamente para ubicar el mapa.
-- El CO₂ DEMO usa los factores semilla de docs/DATABASE.md §4 (valores
-- orientativos de desarrollo), no los factores vigentes.
--
-- Uso:  SELECT geo.seed_demo(5000);   SELECT geo.clear_demo();
-- =============================================================================

CREATE OR REPLACE FUNCTION geo.clear_demo() RETURNS void
LANGUAGE sql AS $$
    DELETE FROM geo.demo_trips;
    DELETE FROM geo.demo_stations;
    DELETE FROM geo.demo_bike_lanes;
    DELETE FROM geo.mobility_zones WHERE is_demo;
$$;

CREATE OR REPLACE FUNCTION geo.seed_demo(p_trips integer DEFAULT 5000, p_seed float8 DEFAULT 0.42)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    c_lon  constant float8 := -100.39;   -- anclaje aproximado, solo para el mapa
    c_lat  constant float8 := 20.59;
    c_half constant float8 := 0.055;     -- ~12 km de lado
    v_users uuid[];
BEGIN
    PERFORM geo.clear_demo();
    PERFORM setseed(p_seed);

    -- Zonas DEMO: rejilla 4×4 (no son colonias ni AGEB reales)
    INSERT INTO geo.mobility_zones (code, name, kind, geom, source, is_demo)
    SELECT format('DEMO-%s%s', chr(65 + gx), gy + 1),
           format('DEMO Zona %s%s', chr(65 + gx), gy + 1),
           'custom',
           ST_Multi(ST_MakeEnvelope(
               c_lon - c_half + gx * (c_half / 2), c_lat - c_half + gy * (c_half / 2),
               c_lon - c_half + (gx + 1) * (c_half / 2), c_lat - c_half + (gy + 1) * (c_half / 2), 4326)),
           'DEMO', true
    FROM generate_series(0, 3) gx, generate_series(0, 3) gy;

    INSERT INTO geo.demo_bike_lanes (name, is_protected, geom) VALUES
      ('DEMO Ciclovía Eje Norte-Sur', true,
       ST_SetSRID(ST_MakeLine(ST_MakePoint(c_lon, c_lat - 0.045), ST_MakePoint(c_lon, c_lat + 0.045)), 4326)),
      ('DEMO Ciclovía Eje Oriente-Poniente', false,
       ST_SetSRID(ST_MakeLine(ST_MakePoint(c_lon - 0.045, c_lat + 0.01), ST_MakePoint(c_lon + 0.045, c_lat + 0.01)), 4326)),
      ('DEMO Ciclovía Diagonal', false,
       ST_SetSRID(ST_MakeLine(ST_MakePoint(c_lon - 0.03, c_lat - 0.03), ST_MakePoint(c_lon + 0.02, c_lat + 0.02)), 4326));

    INSERT INTO geo.demo_stations (kind, name, geom)
    SELECT k.kind, format('DEMO %s %s', k.label, n),
           ST_SetSRID(ST_MakePoint(c_lon + (random() - 0.5) * 2 * c_half * 0.8,
                                   c_lat + (random() - 0.5) * 2 * c_half * 0.8), 4326)
    FROM (VALUES ('bike_station', 'Estación bici', 12), ('bus_stop', 'Parada', 40)) k(kind, label, cnt),
         LATERAL generate_series(1, k.cnt) n;

    SELECT array_agg(gen_random_uuid()) INTO v_users FROM generate_series(1, 400);

    WITH f(mode, g) AS (VALUES  -- DATABASE.md §4 (semilla de desarrollo)
        ('WALK', 0.0), ('BICYCLE', 0.0), ('E_SCOOTER', 25.0), ('BUS', 68.0),
        ('CARPOOL', 64.0), ('MOTORCYCLE', 103.0), ('CAR', 192.0)),
    s AS (
        SELECT
            (ARRAY['WALK', 'BICYCLE', 'BICYCLE', 'E_SCOOTER', 'BUS', 'BUS', 'CARPOOL', 'MOTORCYCLE', 'CAR'])
                [1 + floor(random() * 9)::int + 0 * n] AS mode,
            date_trunc('day', now() - make_interval(days => floor(random() * 365)::int))
              + make_interval(hours => (ARRAY[7, 8, 8, 9, 13, 14, 17, 18, 18, 19, 21])[1 + floor(random() * 11)::int],
                              mins => floor(random() * 60)::int) AS t0,
            (ARRAY[0.0, 0.03, -0.03, 0.02, -0.025])[1 + floor(random() * 5)::int] AS ox,
            (ARRAY[0.0, 0.02, -0.02, -0.03, 0.03])[1 + floor(random() * 5)::int]  AS oy,
            (ARRAY[0.0, 0.03, -0.03, 0.02, -0.025])[1 + floor(random() * 5)::int] AS dx,
            (ARRAY[0.0, 0.02, -0.02, -0.03, 0.03])[1 + floor(random() * 5)::int]  AS dy,
            random() AS r1, random() AS r2, random() AS r3, random() AS r4, random() AS r5, random() AS r6
        FROM generate_series(1, p_trips) n
    ),
    g AS (
        SELECT s.mode, s.t0,
               ST_SetSRID(ST_MakePoint(c_lon + s.ox + (s.r1 - 0.5) * 0.02, c_lat + s.oy + (s.r2 - 0.5) * 0.02), 4326) AS o,
               ST_SetSRID(ST_MakePoint(c_lon + s.dx + (s.r3 - 0.5) * 0.02, c_lat + s.dy + (s.r4 - 0.5) * 0.02), 4326) AS d,
               s.r5, s.r6
        FROM s
    ),
    r AS (
        SELECT g.mode, g.t0,
               ST_MakeLine(ARRAY[g.o,
                   ST_SetSRID(ST_MakePoint((ST_X(g.o) + ST_X(g.d)) / 2 + (g.r5 - 0.5) * 0.004,
                                           (ST_Y(g.o) + ST_Y(g.d)) / 2 + (g.r6 - 0.5) * 0.004), 4326),
                   g.d]) AS route
        FROM g
    )
    INSERT INTO geo.demo_trips (user_id, mode_code, started_at, ended_at, route,
                                emission_factor_g_per_km, co2_emitted_g, co2_saved_g)
    SELECT v_users[1 + floor(random() * 400)::int],
           r.mode, r.t0, r.t0 + make_interval(mins => 5 + floor(random() * 50)::int), r.route,
           f.g,
           ST_Length(r.route::geography) / 1000 * f.g,
           GREATEST(0, ST_Length(r.route::geography) / 1000 * (192.0 - f.g))
    FROM r JOIN f ON f.mode = r.mode
    WHERE ST_NPoints(r.route) >= 2 AND NOT ST_Equals(ST_StartPoint(r.route), ST_EndPoint(r.route));

    RETURN format('DEMO: %s viajes, %s zonas, %s ciclovías, %s estaciones',
        (SELECT count(*) FROM geo.demo_trips),
        (SELECT count(*) FROM geo.mobility_zones WHERE is_demo),
        (SELECT count(*) FROM geo.demo_bike_lanes),
        (SELECT count(*) FROM geo.demo_stations));
END $$;
