-- =============================================================================
-- EcoMove Querétaro — Módulo geoespacial: esquema `geo` y vistas adaptadoras
-- -----------------------------------------------------------------------------
-- Requiere PostgreSQL >= 14 y PostGIS >= 3.1 (ST_SquareGrid / ST_HexagonGrid).
--
-- Este módulo NO crea ni duplica las tablas oficiales (trips, cycleways, pois,
-- emission_factors), que son propiedad del agente database. En su lugar:
--
--   * geo.v_trips / geo.v_bike_lanes / geo.v_stations / geo.v_zones son vistas
--     que leen las tablas canónicas de docs/DATABASE.md §3 (public.trips,
--     cycleways, pois) y les añaden:
--       - proyección métrica UTM 14N (EPSG:32614) para cálculos en metros;
--       - origen/destino derivados de la ruta cuando no hay columnas propias;
--       - la bandera is_demo.
--   * Los datos DEMO viven en tablas aisladas geo.demo_* y NUNCA se mezclan en
--     las tablas oficiales. Solo se consultan con dataset=demo (p_demo = true), nunca mezclados.
--   * geo.mobility_zones guarda zonas de análisis (colonias, AGEB, distritos)
--     con su fuente obligatoria.
--
-- SRID de almacenamiento 4326; SRID de cálculo 32614.
-- Idempotente: se puede ejecutar varias veces (las vistas se recrean).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS geo;

-- -----------------------------------------------------------------------------
-- Zonas de análisis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo.mobility_zones (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text UNIQUE,
    name        text NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('colonia', 'ageb', 'municipio', 'distrito', 'custom')),
    geom        geometry(MultiPolygon, 4326) NOT NULL,
    geom_utm    geometry(MultiPolygon, 32614) GENERATED ALWAYS AS (ST_Transform(geom, 32614)) STORED,
    area_km2    double precision GENERATED ALWAYS AS (ST_Area(geom::geography) / 1e6) STORED,
    source      text NOT NULL,          -- p. ej. 'INEGI-MGE-2020', 'municipio:2026-05', 'DEMO'
    is_demo     boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mobility_zones_demo_source CHECK (is_demo = (source = 'DEMO'))
);
CREATE INDEX IF NOT EXISTS mobility_zones_geom_utm_gix ON geo.mobility_zones USING gist (geom_utm);
CREATE INDEX IF NOT EXISTS mobility_zones_geom_gix     ON geo.mobility_zones USING gist (geom);
CREATE INDEX IF NOT EXISTS mobility_zones_kind_idx     ON geo.mobility_zones (kind);

-- -----------------------------------------------------------------------------
-- Tablas DEMO aisladas (ver 900_demo_seed.sql). Sin FK a users: los user_id
-- son UUID aleatorios que no corresponden a ninguna cuenta.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo.demo_trips (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,
    mode_code       text NOT NULL,
    started_at      timestamptz NOT NULL,
    ended_at        timestamptz NOT NULL CHECK (ended_at > started_at),
    route           geometry(LineString, 4326) NOT NULL,
    distance_m      double precision GENERATED ALWAYS AS (ST_Length(route::geography)) STORED,
    emission_factor_g_per_km double precision NOT NULL,
    co2_emitted_g   double precision NOT NULL CHECK (co2_emitted_g >= 0),
    co2_saved_g     double precision NOT NULL CHECK (co2_saved_g >= 0)
);

CREATE TABLE IF NOT EXISTS geo.demo_bike_lanes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL CHECK (name LIKE 'DEMO %'),
    is_protected  boolean NOT NULL DEFAULT false,
    geom          geometry(LineString, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS geo.demo_stations (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind  text NOT NULL CHECK (kind IN ('bike_station', 'bus_stop')),
    name  text NOT NULL CHECK (name LIKE 'DEMO %'),
    geom  geometry(Point, 4326) NOT NULL
);

-- Índices de expresión DEMO: mismas expresiones que usan las vistas.
CREATE INDEX IF NOT EXISTS demo_trips_origin_utm_gix ON geo.demo_trips USING gist (ST_Transform(ST_StartPoint(route), 32614));
CREATE INDEX IF NOT EXISTS demo_trips_dest_utm_gix   ON geo.demo_trips USING gist (ST_Transform(ST_EndPoint(route), 32614));
CREATE INDEX IF NOT EXISTS demo_trips_route_utm_gix  ON geo.demo_trips USING gist (ST_Transform(route, 32614));
CREATE INDEX IF NOT EXISTS demo_trips_started_idx    ON geo.demo_trips (started_at);
CREATE INDEX IF NOT EXISTS demo_trips_mode_idx       ON geo.demo_trips (mode_code, started_at);
CREATE INDEX IF NOT EXISTS demo_bike_lanes_utm_gix   ON geo.demo_bike_lanes USING gist (ST_Transform(geom, 32614));
CREATE INDEX IF NOT EXISTS demo_stations_utm_gix     ON geo.demo_stations USING gist (ST_Transform(geom, 32614));

-- -----------------------------------------------------------------------------
-- Vistas adaptadoras (si falta una tabla canónica, la vista solo trae DEMO)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geo._has_column(p_table text, p_column text) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column)
$$;

CREATE OR REPLACE FUNCTION geo.rebuild_adapters() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    v_trips   text;
    v_lanes   text;
    v_sta     text;
    v_zones   text;
    v_variant text := 'demo-only';
BEGIN
    -- CREATE OR REPLACE: las columnas son idénticas en todas las variantes, así que
    -- reconstruir no invalida funciones ni la vista materializada que dependen de ellas.

    -- ---------------- Viajes ----------------
    v_trips := $q$
        SELECT d.id, d.user_id, d.mode_code, d.started_at, d.ended_at, d.route,
               ST_StartPoint(d.route) AS origin, ST_EndPoint(d.route) AS destination,
               ST_Transform(ST_StartPoint(d.route), 32614) AS origin_utm,
               ST_Transform(ST_EndPoint(d.route), 32614) AS destination_utm,
               ST_Transform(d.route, 32614) AS route_utm,
               d.distance_m, d.emission_factor_g_per_km, d.co2_emitted_g, d.co2_saved_g,
               true AS is_demo, true AS is_completed
        FROM geo.demo_trips d $q$;

    IF geo._has_column('trips', 'mode') AND geo._has_column('trips', 'co2_saved_g') THEN
        -- Contrato v1.0 (DATABASE.md §3): route obligatoria, O/D = extremos de la ruta.
        v_variant := 'contract-v1';
        v_trips := $q$
        SELECT t.id, t.user_id, t.mode::text AS mode_code, t.started_at, t.ended_at,
               t.route::geometry(LineString, 4326) AS route,
               ST_StartPoint(t.route) AS origin, ST_EndPoint(t.route) AS destination,
               ST_Transform(ST_StartPoint(t.route), 32614) AS origin_utm,
               ST_Transform(ST_EndPoint(t.route), 32614) AS destination_utm,
               ST_Transform(t.route, 32614) AS route_utm,
               t.distance_m, t.emission_factor_g_per_km, t.co2_emitted_g, t.co2_saved_g,
               false AS is_demo,
               -- Sin WHERE en la rama: PostgreSQL solo aplana ramas de UNION ALL sin
               -- condiciones propias; el filtro de estado se aplica en geo.trips_filtered.
               (t.status::text = 'COMPLETED') AS is_completed
        FROM public.trips t
        UNION ALL $q$ || v_trips;
        EXECUTE 'CREATE INDEX IF NOT EXISTS ix_trips_geo_origin_utm ON public.trips USING gist (ST_Transform(ST_StartPoint(route), 32614))';
        EXECUTE 'CREATE INDEX IF NOT EXISTS ix_trips_geo_dest_utm ON public.trips USING gist (ST_Transform(ST_EndPoint(route), 32614))';
        EXECUTE 'CREATE INDEX IF NOT EXISTS ix_trips_geo_route_utm ON public.trips USING gist (ST_Transform(route, 32614))';
        EXECUTE 'CREATE INDEX IF NOT EXISTS ix_trips_geo_mode_started ON public.trips (mode, started_at)';
    ELSE
        RAISE NOTICE 'geo: no se reconoce public.trips; v_trips solo contiene datos DEMO';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW geo.v_trips AS ' || v_trips;
    COMMENT ON VIEW geo.v_trips IS 'Adaptador de viajes para el módulo geo. mode_code en MAYÚSCULAS (enum TransportMode).';

    -- ---------------- Ciclovías ----------------
    v_lanes := $q$
        SELECT d.id, d.name, d.is_protected, d.geom, ST_Transform(d.geom, 32614) AS geom_utm, true AS is_demo
        FROM geo.demo_bike_lanes d $q$;
    IF geo._has_column('cycleways', 'geom') THEN
        v_lanes := $q$
        SELECT c.id, c.name::text AS name, c.is_protected, c.geom::geometry(LineString, 4326) AS geom,
               ST_Transform(c.geom, 32614) AS geom_utm, false AS is_demo
        FROM public.cycleways c
        UNION ALL $q$ || v_lanes;
        EXECUTE 'CREATE INDEX IF NOT EXISTS ix_cycleways_geo_utm ON public.cycleways USING gist (ST_Transform(geom, 32614))';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW geo.v_bike_lanes AS ' || v_lanes;

    -- ---------------- Estaciones / paradas ----------------
    -- kind normalizado: 'bike_station' (bici/scooter compartido o estacionamiento) | 'bus_stop'
    v_sta := $q$
        SELECT d.id, d.kind, d.name, d.geom, ST_Transform(d.geom, 32614) AS geom_utm, true AS is_demo
        FROM geo.demo_stations d $q$;
    IF geo._has_column('pois', 'category') THEN
        v_sta := $q$
        SELECT p.id,
               CASE WHEN p.category::text = 'BUS_STOP' THEN 'bus_stop' ELSE 'bike_station' END AS kind,
               p.name::text AS name, p.location::geometry(Point, 4326) AS geom,
               ST_Transform(p.location, 32614) AS geom_utm, false AS is_demo
        FROM public.pois p
        WHERE p.is_active AND p.category::text IN ('BUS_STOP', 'BIKE_SHARING', 'BIKE_PARKING')
        UNION ALL $q$ || v_sta;
        -- (esta rama sí filtra: pois es una tabla pequeña y no se une por índice parametrizado)
        EXECUTE 'CREATE INDEX IF NOT EXISTS ix_pois_geo_utm ON public.pois USING gist (ST_Transform(location, 32614))';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW geo.v_stations AS ' || v_sta;

    -- ---------------- Zonas ----------------
    v_zones := $q$
        SELECT z.id, z.code, z.name, z.kind, z.geom, z.geom_utm, z.area_km2, z.source, z.is_demo
        FROM geo.mobility_zones z $q$;
    EXECUTE 'CREATE OR REPLACE VIEW geo.v_zones AS ' || v_zones;

    RETURN v_variant;
END $$;

SELECT geo.rebuild_adapters();
