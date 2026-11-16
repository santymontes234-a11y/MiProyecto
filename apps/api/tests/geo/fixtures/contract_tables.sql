-- Fixture de PRUEBA: réplica mínima de las tablas canónicas de docs/DATABASE.md §3
-- (sin FKs a users) para probar el módulo geo sin depender de las migraciones.
-- No se usa fuera de tests.
CREATE EXTENSION IF NOT EXISTS postgis;
DO $$ BEGIN
  CREATE TYPE transport_mode AS ENUM ('WALK','BICYCLE','E_SCOOTER','BUS','CARPOOL','MOTORCYCLE','CAR');
  CREATE TYPE trip_status AS ENUM ('COMPLETED','CANCELLED');
  CREATE TYPE poi_category AS ENUM ('BIKE_PARKING','BIKE_SHARING','BUS_STOP','EV_CHARGER','REPAIR_STATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, client_trip_id uuid NOT NULL DEFAULT gen_random_uuid(),
  mode transport_mode NOT NULL, status trip_status NOT NULL DEFAULT 'COMPLETED',
  started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL, distance_m double precision NOT NULL,
  duration_s integer NOT NULL, route geometry(LineString,4326) NOT NULL, emission_factor_g_per_km double precision NOT NULL,
  co2_emitted_g double precision NOT NULL, co2_saved_g double precision NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_trips_user_started ON public.trips (user_id, started_at);
CREATE INDEX IF NOT EXISTS ix_trips_started ON public.trips (started_at);
CREATE INDEX IF NOT EXISTS ix_trips_route ON public.trips USING gist (route);
CREATE TABLE IF NOT EXISTS public.cycleways (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(160), is_protected boolean NOT NULL DEFAULT false,
  osm_id bigint UNIQUE, geom geometry(LineString,4326) NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.pois (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(160) NOT NULL, category poi_category NOT NULL,
  description text, attributes jsonb NOT NULL DEFAULT '{}', location geometry(Point,4326) NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
