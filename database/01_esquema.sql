-- =============================================================================
-- EcoMove Querétaro — 01_esquema.sql
-- Script de creación de la base de datos (DDL completo).
--
-- Generado con pg_dump --schema-only desde una BD creada con las migraciones
-- Alembic 0001–0010 (apps/api/alembic). Las migraciones son la fuente de verdad;
-- este script es el entregable equivalente para ejecutar con psql.
--
-- Contenido: extensión PostGIS, esquema geo, 23 tablas de public (dominio,
-- seguridad y RBAC) y 2 tablas de geo (mobility_zones, zone_census), con
-- tipos ENUM, PK, FK, UNIQUE, CHECK, índices B-tree/GiST y COMMENT ON
-- (diccionario de datos). No incluye las tablas sintéticas geo.demo_* ni las
-- funciones/vistas analíticas del módulo geo.
--
-- Uso (BD vacía, PostgreSQL 16 + PostGIS 3.4):
--   psql -v ON_ERROR_STOP=1 -d ecomove_abd -f database/01_esquema.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS geo;

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: achievement_criterion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.achievement_criterion AS ENUM (
    'TRIPS_COUNT',
    'DISTANCE_M',
    'CO2_SAVED_G',
    'DISTINCT_MODES'
);


--
-- Name: citizen_report_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.citizen_report_category AS ENUM (
    'BIKE_LANE_DAMAGE',
    'MISSING_INFRASTRUCTURE',
    'SAFETY',
    'POI_ISSUE',
    'OTHER'
);


--
-- Name: citizen_report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.citizen_report_status AS ENUM (
    'OPEN',
    'IN_REVIEW',
    'RESOLVED',
    'REJECTED'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'ACHIEVEMENT_UNLOCKED',
    'WEEKLY_SUMMARY',
    'SYSTEM'
);


--
-- Name: poi_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.poi_category AS ENUM (
    'BIKE_PARKING',
    'BIKE_SHARING',
    'BUS_STOP',
    'EV_CHARGER',
    'REPAIR_STATION'
);


--
-- Name: report_format; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_format AS ENUM (
    'csv',
    'pdf'
);


--
-- Name: report_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_type AS ENUM (
    'overview',
    'trips',
    'users',
    'co2_by_mode',
    'co2_by_zone',
    'analytics_timeseries',
    'citizen_reports',
    'audit_logs'
);


--
-- Name: token_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.token_purpose AS ENUM (
    'PASSWORD_RESET',
    'EMAIL_VERIFICATION'
);


--
-- Name: transport_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_mode AS ENUM (
    'WALK',
    'BICYCLE',
    'E_SCOOTER',
    'BUS',
    'CARPOOL',
    'MOTORCYCLE',
    'CAR'
);


--
-- Name: trip_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trip_source AS ENUM (
    'GPS',
    'PLANNED'
);


--
-- Name: trip_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trip_status AS ENUM (
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'USER',
    'ADMIN',
    'SUPER_ADMIN'
);


--
-- Name: vehicle_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vehicle_type AS ENUM (
    'COMPACT',
    'SEDAN',
    'SUV',
    'PICKUP',
    'MINIVAN',
    'HYBRID',
    'ELECTRIC'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_trip_id uuid NOT NULL,
    mode public.transport_mode NOT NULL,
    status public.trip_status DEFAULT 'COMPLETED'::public.trip_status NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone NOT NULL,
    distance_m double precision NOT NULL,
    duration_s integer NOT NULL,
    route public.geometry(LineString,4326) NOT NULL,
    emission_factor_g_per_km double precision NOT NULL,
    co2_emitted_g double precision NOT NULL,
    co2_saved_g double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.trip_source DEFAULT 'GPS'::public.trip_source NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    recurrence_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vehicle_type public.vehicle_type,
    occupants smallint,
    CONSTRAINT ck_trips_carpool_occupants CHECK (((mode <> 'CARPOOL'::public.transport_mode) OR (occupants IS NULL) OR (occupants >= 2))),
    CONSTRAINT ck_trips_co2_positive CHECK (((co2_emitted_g >= (0)::double precision) AND (co2_saved_g >= (0)::double precision))),
    CONSTRAINT ck_trips_distance_duration CHECK (((distance_m >= (0)::double precision) AND (duration_s > 0))),
    CONSTRAINT ck_trips_occupants_range CHECK (((occupants IS NULL) OR ((occupants >= 1) AND (occupants <= 8)))),
    CONSTRAINT ck_trips_time_order CHECK ((ended_at > started_at)),
    CONSTRAINT ck_trips_vehicle_only_car CHECK (((mode = ANY (ARRAY['CAR'::public.transport_mode, 'CARPOOL'::public.transport_mode])) OR ((vehicle_type IS NULL) AND (occupants IS NULL))))
);


--
-- Name: TABLE trips; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trips IS 'Viajes registrados. La distancia, el CO2 y los puntos los calcula solo el servidor';


--
-- Name: COLUMN trips.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN trips.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.user_id IS 'Dueño del viaje (FK a users.id)';


--
-- Name: COLUMN trips.client_trip_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.client_trip_id IS 'UUID generado por el cliente para idempotencia (único por usuario)';


--
-- Name: COLUMN trips.mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.mode IS 'Medio de transporte (FK a transport_modes.mode)';


--
-- Name: COLUMN trips.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.status IS 'COMPLETED o CANCELLED';


--
-- Name: COLUMN trips.started_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.started_at IS 'Inicio del viaje (UTC)';


--
-- Name: COLUMN trips.ended_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.ended_at IS 'Fin del viaje (UTC); posterior al inicio';


--
-- Name: COLUMN trips.distance_m; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.distance_m IS 'Distancia geodésica en metros calculada por PostGIS';


--
-- Name: COLUMN trips.duration_s; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.duration_s IS 'Duración en segundos';


--
-- Name: COLUMN trips.route; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.route IS 'Traza del viaje: LineString SRID 4326 (dato personal sensible)';


--
-- Name: COLUMN trips.emission_factor_g_per_km; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.emission_factor_g_per_km IS 'Factor aplicado (g CO2/km por pasajero) al calcular el viaje; histórico';


--
-- Name: COLUMN trips.co2_emitted_g; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.co2_emitted_g IS 'CO2 emitido estimado, en gramos';


--
-- Name: COLUMN trips.co2_saved_g; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.co2_saved_g IS 'CO2 evitado estimado frente al automóvil de referencia, en gramos';


--
-- Name: COLUMN trips.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: COLUMN trips.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.source IS 'Origen: GPS (grabado) o PLANNED (ruta de /routes con route_token)';


--
-- Name: COLUMN trips.points; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.points IS 'Puntos ganados = floor(co2_saved_g / 100); 0 si está cancelado';


--
-- Name: COLUMN trips.recurrence_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.recurrence_id IS 'Serie de viajes recurrentes a la que pertenece (NULL si es suelto)';


--
-- Name: COLUMN trips.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.updated_at IS 'Fecha y hora de la última modificación (UTC)';


--
-- Name: COLUMN trips.vehicle_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.vehicle_type IS 'Tipo de automóvil (solo CAR/CARPOOL; FK a vehicle_types.code)';


--
-- Name: COLUMN trips.occupants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.occupants IS 'Ocupantes del automóvil, 1–8 (solo CAR/CARPOOL; CARPOOL ≥ 2)';


--
-- Name: cycleways; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cycleways (
    id uuid NOT NULL,
    name character varying(160),
    is_protected boolean DEFAULT false NOT NULL,
    osm_id bigint,
    geom public.geometry(LineString,4326) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE cycleways; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cycleways IS 'Ciclovías (OpenStreetMap, ODbL)';


--
-- Name: COLUMN cycleways.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cycleways.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN cycleways.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cycleways.name IS 'Nombre de la ciclovía (opcional)';


--
-- Name: COLUMN cycleways.is_protected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cycleways.is_protected IS 'Verdadero si está segregada del tráfico';


--
-- Name: COLUMN cycleways.osm_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cycleways.osm_id IS 'Identificador del way de OpenStreetMap (único si existe)';


--
-- Name: COLUMN cycleways.geom; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cycleways.geom IS 'Trazado: LineString SRID 4326';


--
-- Name: COLUMN cycleways.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cycleways.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: pois; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pois (
    id uuid NOT NULL,
    name character varying(160) NOT NULL,
    category public.poi_category NOT NULL,
    description text,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    location public.geometry(Point,4326) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pois; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pois IS 'Puntos de interés (supertipo de la especialización EER disjunta y parcial)';


--
-- Name: COLUMN pois.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN pois.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.name IS 'Nombre del punto de interés';


--
-- Name: COLUMN pois.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.category IS 'Categoría: BIKE_PARKING, BIKE_SHARING, BUS_STOP, EV_CHARGER, REPAIR_STATION';


--
-- Name: COLUMN pois.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.description IS 'Descripción libre (opcional)';


--
-- Name: COLUMN pois.attributes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.attributes IS 'Atributos no estructurados (source, osm_id, ref de OSM…); los estructurados viven en los subtipos';


--
-- Name: COLUMN pois.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.location IS 'Ubicación: Point SRID 4326';


--
-- Name: COLUMN pois.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.is_active IS 'Falso = borrado lógico';


--
-- Name: COLUMN pois.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: COLUMN pois.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pois.updated_at IS 'Fecha y hora de la última modificación (UTC)';


--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid NOT NULL,
    code character varying(40) NOT NULL,
    name character varying(80) NOT NULL,
    description character varying(300) NOT NULL,
    icon character varying(40) NOT NULL,
    criterion public.achievement_criterion NOT NULL,
    threshold double precision NOT NULL,
    bonus_points integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_achievements_bonus_range CHECK (((bonus_points >= 0) AND (bonus_points <= 10000))),
    CONSTRAINT ck_achievements_code_format CHECK (((code)::text ~ '^[A-Z0-9_]{2,40}$'::text)),
    CONSTRAINT ck_achievements_threshold_positive CHECK ((threshold > (0)::double precision))
);


--
-- Name: TABLE achievements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.achievements IS 'Catálogo de logros de gamificación';


--
-- Name: COLUMN achievements.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN achievements.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.code IS 'Código único en mayúsculas, p. ej. FIRST_TRIP';


--
-- Name: COLUMN achievements.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.name IS 'Nombre visible del logro';


--
-- Name: COLUMN achievements.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.description IS 'Descripción del logro';


--
-- Name: COLUMN achievements.icon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.icon IS 'Nombre del icono que muestran los clientes';


--
-- Name: COLUMN achievements.criterion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.criterion IS 'Métrica evaluada: TRIPS_COUNT, DISTANCE_M, CO2_SAVED_G, DISTINCT_MODES';


--
-- Name: COLUMN achievements.threshold; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.threshold IS 'Valor que hay que alcanzar (> 0)';


--
-- Name: COLUMN achievements.bonus_points; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.bonus_points IS 'Puntos extra al obtenerlo (0–10000)';


--
-- Name: COLUMN achievements.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.is_active IS 'Falso = el logro ya no se otorga ni se muestra';


--
-- Name: COLUMN achievements.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: COLUMN achievements.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.achievements.updated_at IS 'Fecha y hora de la última modificación (UTC)';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid NOT NULL,
    actor_id uuid,
    action character varying(64) NOT NULL,
    entity_type character varying(32) NOT NULL,
    entity_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS 'Bitácora de auditoría de operaciones administrativas (append-only)';


--
-- Name: COLUMN audit_logs.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN audit_logs.actor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.actor_id IS 'Usuario que realizó la acción (FK a users.id; NULL si se borró)';


--
-- Name: COLUMN audit_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.action IS 'Acción en mayúsculas, p. ej. USER_ROLE_CHANGED';


--
-- Name: COLUMN audit_logs.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.entity_type IS 'Tipo de entidad afectada';


--
-- Name: COLUMN audit_logs.entity_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.entity_id IS 'Identificador de la entidad afectada';


--
-- Name: COLUMN audit_logs.payload; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.payload IS 'Detalle redactado (sin secretos ni coordenadas); JSONB justificado';


--
-- Name: COLUMN audit_logs.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: bike_stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bike_stations (
    poi_id uuid NOT NULL,
    category public.poi_category NOT NULL,
    code character varying(32),
    capacity integer,
    CONSTRAINT ck_bike_stations_capacity CHECK (((capacity IS NULL) OR ((capacity >= 1) AND (capacity <= 10000)))),
    CONSTRAINT ck_bike_stations_category CHECK ((category = ANY (ARRAY['BIKE_SHARING'::public.poi_category, 'BIKE_PARKING'::public.poi_category]))),
    CONSTRAINT ck_bike_stations_code_format CHECK (((code)::text ~ '^[A-Z0-9_-]{2,32}$'::text))
);


--
-- Name: TABLE bike_stations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bike_stations IS 'Subtipo de pois: estaciones y estacionamientos de bicicleta';


--
-- Name: COLUMN bike_stations.poi_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bike_stations.poi_id IS 'PK y FK compuesta (poi_id, category) a pois';


--
-- Name: COLUMN bike_stations.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bike_stations.category IS 'BIKE_SHARING o BIKE_PARKING (garantiza la disyunción)';


--
-- Name: COLUMN bike_stations.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bike_stations.code IS 'Código oficial de la estación (único, opcional)';


--
-- Name: COLUMN bike_stations.capacity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bike_stations.capacity IS 'Número de lugares (1–10000, opcional)';


--
-- Name: citizen_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.citizen_reports (
    id uuid NOT NULL,
    reporter_id uuid,
    category public.citizen_report_category NOT NULL,
    status public.citizen_report_status DEFAULT 'OPEN'::public.citizen_report_status NOT NULL,
    title character varying(120) NOT NULL,
    description text NOT NULL,
    location public.geometry(Point,4326) NOT NULL,
    poi_id uuid,
    resolution_note character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE citizen_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.citizen_reports IS 'Reportes ciudadanos sobre infraestructura y seguridad';


--
-- Name: COLUMN citizen_reports.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN citizen_reports.reporter_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.reporter_id IS 'Ciudadano que reporta (FK a users.id; NULL si borró su cuenta)';


--
-- Name: COLUMN citizen_reports.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.category IS 'BIKE_LANE_DAMAGE, MISSING_INFRASTRUCTURE, SAFETY, POI_ISSUE u OTHER';


--
-- Name: COLUMN citizen_reports.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.status IS 'OPEN, IN_REVIEW, RESOLVED o REJECTED';


--
-- Name: COLUMN citizen_reports.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.title IS 'Título (3–120)';


--
-- Name: COLUMN citizen_reports.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.description IS 'Descripción (máx. 2000)';


--
-- Name: COLUMN citizen_reports.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.location IS 'Ubicación del problema: Point SRID 4326';


--
-- Name: COLUMN citizen_reports.poi_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.poi_id IS 'Punto de interés relacionado (FK a pois.id, opcional)';


--
-- Name: COLUMN citizen_reports.resolution_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.resolution_note IS 'Nota del administrador al resolver';


--
-- Name: COLUMN citizen_reports.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: COLUMN citizen_reports.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizen_reports.updated_at IS 'Fecha y hora de la última modificación (UTC)';


--
-- Name: emission_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emission_factors (
    mode public.transport_mode NOT NULL,
    grams_per_km double precision NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT ck_emission_factors_positive CHECK ((grams_per_km >= (0)::double precision))
);


--
-- Name: TABLE emission_factors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.emission_factors IS 'Factores de emisión vigentes por medio de transporte (g CO2/km por pasajero)';


--
-- Name: COLUMN emission_factors.mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emission_factors.mode IS 'Medio de transporte (PK)';


--
-- Name: COLUMN emission_factors.grams_per_km; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emission_factors.grams_per_km IS 'Gramos de CO2 por kilómetro y pasajero';


--
-- Name: COLUMN emission_factors.valid_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emission_factors.valid_from IS 'Inicio de vigencia del valor actual';


--
-- Name: COLUMN emission_factors.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emission_factors.updated_by IS 'Último SUPER_ADMIN que lo modificó (FK a users.id)';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    title character varying(120) NOT NULL,
    body character varying(500) NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'Notificaciones in-app; se conservan 90 días';


--
-- Name: COLUMN notifications.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN notifications.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.user_id IS 'Destinatario (FK a users.id)';


--
-- Name: COLUMN notifications.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.type IS 'ACHIEVEMENT_UNLOCKED, WEEKLY_SUMMARY o SYSTEM';


--
-- Name: COLUMN notifications.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.title IS 'Título (máx. 120)';


--
-- Name: COLUMN notifications.body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.body IS 'Texto (máx. 500)';


--
-- Name: COLUMN notifications.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.data IS 'Datos semiestructurados e inmutables del evento (JSONB justificado)';


--
-- Name: COLUMN notifications.read_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.read_at IS 'Fecha de lectura; NULL si no se ha leído';


--
-- Name: COLUMN notifications.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    code character varying(64) NOT NULL,
    description character varying(255) NOT NULL
);


--
-- Name: TABLE permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.permissions IS 'Catálogo de permisos atómicos RBAC';


--
-- Name: COLUMN permissions.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissions.code IS 'Código del permiso (PK), p. ej. trips:own';


--
-- Name: COLUMN permissions.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissions.description IS 'Descripción del permiso';


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_created_at timestamp with time zone,
    last_used_at timestamp with time zone,
    user_agent character varying(255)
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.refresh_tokens IS 'Refresh tokens rotativos; cada familia es una sesión (dispositivo). Solo se guarda el hash';


--
-- Name: COLUMN refresh_tokens.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.id IS 'Identificador del token (= claim jti)';


--
-- Name: COLUMN refresh_tokens.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.user_id IS 'Dueño del token (FK a users.id)';


--
-- Name: COLUMN refresh_tokens.family_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.family_id IS 'Familia de rotación = sesión; reutilizar un token revoca toda la familia';


--
-- Name: COLUMN refresh_tokens.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.token_hash IS 'SHA-256 del token (nunca el token en claro)';


--
-- Name: COLUMN refresh_tokens.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.expires_at IS 'Caducidad del token (UTC)';


--
-- Name: COLUMN refresh_tokens.revoked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.revoked_at IS 'Fecha de revocación; NULL si sigue vigente';


--
-- Name: COLUMN refresh_tokens.replaced_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.replaced_by_id IS 'Token que lo sustituyó al rotar';


--
-- Name: COLUMN refresh_tokens.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: COLUMN refresh_tokens.session_created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.session_created_at IS 'Inicio de la sesión (primer token de la familia)';


--
-- Name: COLUMN refresh_tokens.last_used_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.last_used_at IS 'Último uso de la sesión';


--
-- Name: COLUMN refresh_tokens.user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.user_agent IS 'User-Agent del cliente (máx. 255 caracteres), para listar sesiones';


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid NOT NULL,
    report_type public.report_type NOT NULL,
    format public.report_format NOT NULL,
    parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    row_count integer NOT NULL,
    content bytea NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_reports_row_count_positive CHECK ((row_count >= 0))
);


--
-- Name: TABLE reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reports IS 'Informes administrativos generados (CSV/PDF), sin datos personales';


--
-- Name: COLUMN reports.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN reports.report_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.report_type IS 'Tipo de informe: overview, trips, users, co2_by_mode, co2_by_zone, …';


--
-- Name: COLUMN reports.format; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.format IS 'csv o pdf';


--
-- Name: COLUMN reports.parameters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.parameters IS 'Parámetros usados (rango de fechas); JSONB justificado';


--
-- Name: COLUMN reports.row_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.row_count IS 'Número de filas del informe';


--
-- Name: COLUMN reports.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.content IS 'Contenido binario del archivo generado';


--
-- Name: COLUMN reports.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.created_by IS 'Administrador que lo generó (FK a users.id)';


--
-- Name: COLUMN reports.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role public.user_role NOT NULL,
    permission_code character varying(64) NOT NULL
);


--
-- Name: TABLE role_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.role_permissions IS 'Relación N:M entre roles y permisos';


--
-- Name: COLUMN role_permissions.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.role_permissions.role IS 'Rol (PK compuesta, FK a roles.name)';


--
-- Name: COLUMN role_permissions.permission_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.role_permissions.permission_code IS 'Permiso (PK compuesta, FK a permissions.code)';


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    name public.user_role NOT NULL,
    description character varying(255) NOT NULL,
    level smallint NOT NULL
);


--
-- Name: TABLE roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roles IS 'Catálogo de roles RBAC';


--
-- Name: COLUMN roles.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.name IS 'Nombre del rol (PK): USER, ADMIN, SUPER_ADMIN';


--
-- Name: COLUMN roles.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.description IS 'Descripción del rol';


--
-- Name: COLUMN roles.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.level IS 'Nivel jerárquico (1 = USER, 2 = ADMIN, 3 = SUPER_ADMIN)';


--
-- Name: stop_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stop_lines (
    stop_id uuid NOT NULL,
    line_id uuid NOT NULL
);


--
-- Name: TABLE stop_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stop_lines IS 'Relación N:M entre paradas y líneas';


--
-- Name: COLUMN stop_lines.stop_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stop_lines.stop_id IS 'Parada (PK compuesta, FK a transit_stops.poi_id)';


--
-- Name: COLUMN stop_lines.line_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stop_lines.line_id IS 'Línea (PK compuesta, FK a transit_lines.id)';


--
-- Name: transit_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transit_lines (
    id uuid NOT NULL,
    code character varying(32) NOT NULL,
    name character varying(120) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_transit_lines_code_format CHECK (((code)::text ~ '^[A-Za-z0-9 ._-]{1,32}$'::text))
);


--
-- Name: TABLE transit_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transit_lines IS 'Líneas de transporte público';


--
-- Name: COLUMN transit_lines.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_lines.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN transit_lines.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_lines.code IS 'Clave de la línea (única), p. ej. L55';


--
-- Name: COLUMN transit_lines.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_lines.name IS 'Nombre de la línea';


--
-- Name: COLUMN transit_lines.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_lines.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: transit_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transit_stops (
    poi_id uuid NOT NULL,
    category public.poi_category DEFAULT 'BUS_STOP'::public.poi_category NOT NULL,
    code character varying(32),
    osm_ref character varying(64),
    CONSTRAINT ck_transit_stops_category CHECK ((category = 'BUS_STOP'::public.poi_category)),
    CONSTRAINT ck_transit_stops_code_format CHECK (((code)::text ~ '^[A-Z0-9_-]{2,32}$'::text))
);


--
-- Name: TABLE transit_stops; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transit_stops IS 'Subtipo de pois: paradas de autobús (category = BUS_STOP)';


--
-- Name: COLUMN transit_stops.poi_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_stops.poi_id IS 'PK y FK compuesta (poi_id, category) a pois';


--
-- Name: COLUMN transit_stops.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_stops.category IS 'Siempre BUS_STOP (garantiza la disyunción)';


--
-- Name: COLUMN transit_stops.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_stops.code IS 'Código oficial de parada asignado por un administrador (único, opcional)';


--
-- Name: COLUMN transit_stops.osm_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transit_stops.osm_ref IS 'Etiqueta ref de OpenStreetMap (informativa, no única)';


--
-- Name: transport_modes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_modes (
    mode public.transport_mode NOT NULL,
    max_speed_kmh double precision NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_transport_modes_speed CHECK (((max_speed_kmh > (0)::double precision) AND (max_speed_kmh <= (300)::double precision)))
);


--
-- Name: TABLE transport_modes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transport_modes IS 'Configuración por medio de transporte (sin factor ni etiqueta)';


--
-- Name: COLUMN transport_modes.mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transport_modes.mode IS 'Medio de transporte (PK)';


--
-- Name: COLUMN transport_modes.max_speed_kmh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transport_modes.max_speed_kmh IS 'Velocidad media máxima plausible (km/h) para validar viajes';


--
-- Name: COLUMN transport_modes.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transport_modes.is_active IS 'Falso = no se aceptan viajes nuevos con este medio';


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    achievement_id uuid NOT NULL,
    bonus_points integer DEFAULT 0 NOT NULL,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_achievements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_achievements IS 'Logros obtenidos por cada usuario (N:M users–achievements)';


--
-- Name: COLUMN user_achievements.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_achievements.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN user_achievements.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_achievements.user_id IS 'Usuario (FK a users.id)';


--
-- Name: COLUMN user_achievements.achievement_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_achievements.achievement_id IS 'Logro (FK a achievements.id); único por usuario';


--
-- Name: COLUMN user_achievements.bonus_points; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_achievements.bonus_points IS 'Bono congelado al otorgarlo (editar el logro no altera puntos ganados)';


--
-- Name: COLUMN user_achievements.awarded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_achievements.awarded_at IS 'Fecha en que se otorgó';


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    language character varying(2) DEFAULT 'es'::character varying NOT NULL,
    default_mode public.transport_mode,
    weekly_goal_trips smallint,
    email_notifications boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_vehicle_type public.vehicle_type,
    CONSTRAINT ck_user_preferences_language CHECK (((language)::text = ANY ((ARRAY['es'::character varying, 'en'::character varying])::text[]))),
    CONSTRAINT ck_user_preferences_weekly_goal CHECK (((weekly_goal_trips IS NULL) OR ((weekly_goal_trips >= 1) AND (weekly_goal_trips <= 100))))
);


--
-- Name: TABLE user_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_preferences IS 'Preferencias del usuario (1:1 con users; normalización del antiguo JSONB)';


--
-- Name: COLUMN user_preferences.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.user_id IS 'PK y FK a users.id (relación 1:1)';


--
-- Name: COLUMN user_preferences.language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.language IS 'Idioma de la interfaz: es o en';


--
-- Name: COLUMN user_preferences.default_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.default_mode IS 'Medio de transporte preferido (opcional)';


--
-- Name: COLUMN user_preferences.weekly_goal_trips; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.weekly_goal_trips IS 'Meta semanal de viajes, 1–100 (opcional)';


--
-- Name: COLUMN user_preferences.email_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.email_notifications IS 'Acepta recibir correos informativos';


--
-- Name: COLUMN user_preferences.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.updated_at IS 'Fecha y hora de la última modificación (UTC)';


--
-- Name: COLUMN user_preferences.default_vehicle_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.default_vehicle_type IS 'Tipo de automóvil por omisión para CAR/CARPOOL y como referencia de ahorro (FK)';


--
-- Name: user_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    purpose public.token_purpose NOT NULL,
    token_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_user_tokens_expiry CHECK ((expires_at > created_at))
);


--
-- Name: TABLE user_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_tokens IS 'Tokens de un solo uso para restablecer contraseña y verificar correo (solo hash)';


--
-- Name: COLUMN user_tokens.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_tokens.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN user_tokens.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_tokens.user_id IS 'Dueño del token (FK a users.id)';


--
-- Name: COLUMN user_tokens.purpose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_tokens.purpose IS 'Propósito: PASSWORD_RESET o EMAIL_VERIFICATION';


--
-- Name: COLUMN user_tokens.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_tokens.token_hash IS 'SHA-256 del token (único)';


--
-- Name: COLUMN user_tokens.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_tokens.expires_at IS 'Caducidad: 30 min (reset) o 48 h (verificación)';


--
-- Name: COLUMN user_tokens.used_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_tokens.used_at IS 'Fecha de uso; NULL si no se ha usado';


--
-- Name: COLUMN user_tokens.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_tokens.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email character varying(254) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(120) NOT NULL,
    role public.user_role DEFAULT 'USER'::public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email_verified_at timestamp with time zone,
    ranking_opt_in boolean DEFAULT false NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_users_email_lowercase CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT ck_users_failed_attempts_positive CHECK ((failed_login_attempts >= 0))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'Cuentas de usuario. Datos personales mínimos (LFPDPPP); la contraseña solo como hash Argon2id';


--
-- Name: COLUMN users.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN users.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.email IS 'Correo electrónico en minúsculas; único; identificador de inicio de sesión';


--
-- Name: COLUMN users.password_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.password_hash IS 'Hash Argon2id de la contraseña (nunca la contraseña en claro)';


--
-- Name: COLUMN users.full_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.full_name IS 'Nombre completo para mostrar (1–120 caracteres)';


--
-- Name: COLUMN users.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.role IS 'Rol RBAC: USER, ADMIN o SUPER_ADMIN (FK a roles.name)';


--
-- Name: COLUMN users.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.is_active IS 'Falso = cuenta desactivada por un administrador; no puede iniciar sesión';


--
-- Name: COLUMN users.failed_login_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.failed_login_attempts IS 'Contraseñas incorrectas consecutivas (bloqueo anti fuerza bruta)';


--
-- Name: COLUMN users.locked_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.locked_until IS 'Bloqueo temporal de la cuenta hasta esta fecha (UTC); NULL si no está bloqueada';


--
-- Name: COLUMN users.last_login_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.last_login_at IS 'Último inicio de sesión correcto (UTC)';


--
-- Name: COLUMN users.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: COLUMN users.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.updated_at IS 'Fecha y hora de la última modificación (UTC)';


--
-- Name: COLUMN users.email_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.email_verified_at IS 'Fecha de verificación del correo; NULL si no se ha verificado';


--
-- Name: COLUMN users.ranking_opt_in; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.ranking_opt_in IS 'Consentimiento para aparecer en el ranking público (por defecto falso)';


--
-- Name: COLUMN users.token_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.token_version IS 'Versión de tokens; al incrementarse invalida todos los access tokens emitidos';


--
-- Name: vehicle_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_types (
    code public.vehicle_type NOT NULL,
    grams_per_km double precision NOT NULL,
    max_occupants smallint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source character varying(300) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_vehicle_types_factor CHECK (((grams_per_km >= (0)::double precision) AND (grams_per_km <= (5000)::double precision))),
    CONSTRAINT ck_vehicle_types_max_occupants CHECK (((max_occupants >= 1) AND (max_occupants <= 8)))
);


--
-- Name: TABLE vehicle_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vehicle_types IS 'Tipos de automóvil y su factor de emisión por vehículo, con fuente citada (APA)';


--
-- Name: COLUMN vehicle_types.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_types.code IS 'Tipo de vehículo (PK): COMPACT, SEDAN, SUV, PICKUP, MINIVAN, HYBRID, ELECTRIC';


--
-- Name: COLUMN vehicle_types.grams_per_km; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_types.grams_per_km IS 'Gramos de CO2 por kilómetro del vehículo completo';


--
-- Name: COLUMN vehicle_types.max_occupants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_types.max_occupants IS 'Ocupantes máximos admitidos (1–8)';


--
-- Name: COLUMN vehicle_types.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_types.is_active IS 'Disponible para nuevos viajes';


--
-- Name: COLUMN vehicle_types.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_types.source IS 'Fuente del factor en formato APA o nota de estimación';


--
-- Name: COLUMN vehicle_types.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicle_types.updated_at IS 'Fecha y hora de la última modificación (UTC)';


--
-- Name: achievements achievements_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_code_key UNIQUE (code);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bike_stations bike_stations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_stations
    ADD CONSTRAINT bike_stations_code_key UNIQUE (code);


--
-- Name: bike_stations bike_stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_stations
    ADD CONSTRAINT bike_stations_pkey PRIMARY KEY (poi_id);


--
-- Name: citizen_reports citizen_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizen_reports
    ADD CONSTRAINT citizen_reports_pkey PRIMARY KEY (id);


--
-- Name: cycleways cycleways_osm_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycleways
    ADD CONSTRAINT cycleways_osm_id_key UNIQUE (osm_id);


--
-- Name: cycleways cycleways_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycleways
    ADD CONSTRAINT cycleways_pkey PRIMARY KEY (id);


--
-- Name: emission_factors emission_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emission_factors
    ADD CONSTRAINT emission_factors_pkey PRIMARY KEY (mode);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (code);


--
-- Name: pois pois_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pois
    ADD CONSTRAINT pois_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role, permission_code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (name);


--
-- Name: stop_lines stop_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_lines
    ADD CONSTRAINT stop_lines_pkey PRIMARY KEY (stop_id, line_id);


--
-- Name: transit_lines transit_lines_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_lines
    ADD CONSTRAINT transit_lines_code_key UNIQUE (code);


--
-- Name: transit_lines transit_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_lines
    ADD CONSTRAINT transit_lines_pkey PRIMARY KEY (id);


--
-- Name: transit_stops transit_stops_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stops
    ADD CONSTRAINT transit_stops_code_key UNIQUE (code);


--
-- Name: transit_stops transit_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stops
    ADD CONSTRAINT transit_stops_pkey PRIMARY KEY (poi_id);


--
-- Name: transport_modes transport_modes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_modes
    ADD CONSTRAINT transport_modes_pkey PRIMARY KEY (mode);


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);


--
-- Name: pois uq_pois_id_category; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pois
    ADD CONSTRAINT uq_pois_id_category UNIQUE (id, category);


--
-- Name: trips uq_trips_user_client_trip; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT uq_trips_user_client_trip UNIQUE (user_id, client_trip_id);


--
-- Name: user_achievements uq_user_achievements_user_achievement; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT uq_user_achievements_user_achievement UNIQUE (user_id, achievement_id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_tokens user_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tokens
    ADD CONSTRAINT user_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_tokens user_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tokens
    ADD CONSTRAINT user_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vehicle_types vehicle_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_types
    ADD CONSTRAINT vehicle_types_pkey PRIMARY KEY (code);


--
-- Name: ix_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: ix_audit_logs_actor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_actor_created ON public.audit_logs USING btree (actor_id, created_at);


--
-- Name: ix_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: ix_citizen_reports_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_citizen_reports_location ON public.citizen_reports USING gist (location);


--
-- Name: ix_citizen_reports_reporter_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_citizen_reports_reporter_created ON public.citizen_reports USING btree (reporter_id, created_at);


--
-- Name: ix_citizen_reports_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_citizen_reports_status_created ON public.citizen_reports USING btree (status, created_at);


--
-- Name: ix_cycleways_geo_utm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cycleways_geo_utm ON public.cycleways USING gist (public.st_transform(geom, 32614));


--
-- Name: ix_cycleways_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cycleways_geom ON public.cycleways USING gist (geom);


--
-- Name: ix_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_created_at ON public.notifications USING btree (created_at);


--
-- Name: ix_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: ix_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: ix_pois_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pois_category ON public.pois USING btree (category);


--
-- Name: ix_pois_geo_utm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pois_geo_utm ON public.pois USING gist (public.st_transform(location, 32614));


--
-- Name: ix_pois_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pois_location ON public.pois USING gist (location);


--
-- Name: ix_refresh_tokens_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_tokens_family_id ON public.refresh_tokens USING btree (family_id);


--
-- Name: ix_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: ix_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reports_created_at ON public.reports USING btree (created_at);


--
-- Name: ix_reports_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reports_created_by ON public.reports USING btree (created_by);


--
-- Name: ix_stop_lines_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_stop_lines_line ON public.stop_lines USING btree (line_id);


--
-- Name: ix_trips_geo_dest_utm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_geo_dest_utm ON public.trips USING gist (public.st_transform(public.st_endpoint(route), 32614));


--
-- Name: ix_trips_geo_mode_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_geo_mode_started ON public.trips USING btree (mode, started_at);


--
-- Name: ix_trips_geo_origin_utm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_geo_origin_utm ON public.trips USING gist (public.st_transform(public.st_startpoint(route), 32614));


--
-- Name: ix_trips_geo_route_utm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_geo_route_utm ON public.trips USING gist (public.st_transform(route, 32614));


--
-- Name: ix_trips_recurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_recurrence ON public.trips USING btree (recurrence_id) WHERE (recurrence_id IS NOT NULL);


--
-- Name: ix_trips_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_route ON public.trips USING gist (route);


--
-- Name: ix_trips_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_started ON public.trips USING btree (started_at);


--
-- Name: ix_trips_user_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_user_started ON public.trips USING btree (user_id, started_at DESC);


--
-- Name: ix_user_achievements_awarded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_achievements_awarded_at ON public.user_achievements USING btree (awarded_at);


--
-- Name: ix_user_tokens_user_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_tokens_user_purpose ON public.user_tokens USING btree (user_id, purpose) WHERE (used_at IS NULL);


--
-- Name: ix_users_ranking_opt_in; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_ranking_opt_in ON public.users USING btree (ranking_opt_in) WHERE ranking_opt_in;


--
-- Name: ix_users_role_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_role_active ON public.users USING btree (role, is_active);


--
-- Name: ux_pois_osm_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_pois_osm_ref ON public.pois USING btree (((attributes ->> 'osm_type'::text)), ((attributes ->> 'osm_id'::text))) WHERE ((attributes ->> 'source'::text) = 'osm'::text);


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: citizen_reports citizen_reports_poi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizen_reports
    ADD CONSTRAINT citizen_reports_poi_id_fkey FOREIGN KEY (poi_id) REFERENCES public.pois(id) ON DELETE SET NULL;


--
-- Name: citizen_reports citizen_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizen_reports
    ADD CONSTRAINT citizen_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: emission_factors emission_factors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emission_factors
    ADD CONSTRAINT emission_factors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bike_stations fk_bike_stations_poi; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_stations
    ADD CONSTRAINT fk_bike_stations_poi FOREIGN KEY (poi_id, category) REFERENCES public.pois(id, category) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: emission_factors fk_emission_factors_mode_transport_modes; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emission_factors
    ADD CONSTRAINT fk_emission_factors_mode_transport_modes FOREIGN KEY (mode) REFERENCES public.transport_modes(mode) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: transit_stops fk_transit_stops_poi; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transit_stops
    ADD CONSTRAINT fk_transit_stops_poi FOREIGN KEY (poi_id, category) REFERENCES public.pois(id, category) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: trips fk_trips_mode_transport_modes; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT fk_trips_mode_transport_modes FOREIGN KEY (mode) REFERENCES public.transport_modes(mode) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: trips fk_trips_vehicle_type_vehicle_types; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT fk_trips_vehicle_type_vehicle_types FOREIGN KEY (vehicle_type) REFERENCES public.vehicle_types(code) ON DELETE RESTRICT;


--
-- Name: user_preferences fk_user_preferences_default_mode_transport_modes; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT fk_user_preferences_default_mode_transport_modes FOREIGN KEY (default_mode) REFERENCES public.transport_modes(mode) ON DELETE SET NULL;


--
-- Name: user_preferences fk_user_preferences_default_vehicle_type_vehicle_types; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT fk_user_preferences_default_vehicle_type_vehicle_types FOREIGN KEY (default_vehicle_type) REFERENCES public.vehicle_types(code) ON DELETE SET NULL;


--
-- Name: users fk_users_role_roles; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_role_roles FOREIGN KEY (role) REFERENCES public.roles(name) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_permissions role_permissions_permission_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_code_fkey FOREIGN KEY (permission_code) REFERENCES public.permissions(code) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_fkey FOREIGN KEY (role) REFERENCES public.roles(name) ON DELETE CASCADE;


--
-- Name: stop_lines stop_lines_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_lines
    ADD CONSTRAINT stop_lines_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.transit_lines(id) ON DELETE CASCADE;


--
-- Name: stop_lines stop_lines_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_lines
    ADD CONSTRAINT stop_lines_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(poi_id) ON DELETE CASCADE;


--
-- Name: trips trips_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_tokens user_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tokens
    ADD CONSTRAINT user_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: mobility_zones; Type: TABLE; Schema: geo; Owner: -
--

CREATE TABLE geo.mobility_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    name text NOT NULL,
    kind text NOT NULL,
    geom public.geometry(MultiPolygon,4326) NOT NULL,
    geom_utm public.geometry(MultiPolygon,32614) GENERATED ALWAYS AS (public.st_transform(geom, 32614)) STORED,
    area_km2 double precision GENERATED ALWAYS AS ((public.st_area((geom)::public.geography) / ('1000000'::numeric)::double precision)) STORED,
    source text NOT NULL,
    is_demo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mobility_zones_demo_source CHECK ((is_demo = (source = 'DEMO'::text))),
    CONSTRAINT mobility_zones_kind_check CHECK ((kind = ANY (ARRAY['colonia'::text, 'ageb'::text, 'municipio'::text, 'distrito'::text, 'custom'::text])))
);


--
-- Name: TABLE mobility_zones; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON TABLE geo.mobility_zones IS 'Zonas de análisis (municipios y AGEB del INEGI, zonas de ADMIN y zonas DEMO)';


--
-- Name: COLUMN mobility_zones.id; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.id IS 'Identificador UUID v4 (PK)';


--
-- Name: COLUMN mobility_zones.code; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.code IS 'Clave única de la zona (CVEGEO del INEGI o código de ADMIN)';


--
-- Name: COLUMN mobility_zones.name; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.name IS 'Nombre de la zona';


--
-- Name: COLUMN mobility_zones.kind; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.kind IS 'Tipo: colonia, ageb, municipio, distrito o custom';


--
-- Name: COLUMN mobility_zones.geom; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.geom IS 'Polígono: MultiPolygon SRID 4326';


--
-- Name: COLUMN mobility_zones.geom_utm; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.geom_utm IS 'Polígono en UTM 14N (EPSG:32614) para cálculos métricos';


--
-- Name: COLUMN mobility_zones.area_km2; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.area_km2 IS 'Superficie en km²';


--
-- Name: COLUMN mobility_zones.source; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.source IS 'Fuente de la geometría, p. ej. INEGI-MG-2020 o DEMO';


--
-- Name: COLUMN mobility_zones.is_demo; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.is_demo IS 'Verdadero = zona sintética de demostración; nunca se mezcla con datos oficiales';


--
-- Name: COLUMN mobility_zones.created_at; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.mobility_zones.created_at IS 'Fecha y hora de creación (UTC)';


--
-- Name: zone_census; Type: TABLE; Schema: geo; Owner: -
--

CREATE TABLE geo.zone_census (
    zone_code text NOT NULL,
    source text NOT NULL,
    pobtot integer,
    tvivparhab integer,
    vph_autom integer,
    vph_moto integer,
    vph_bici integer,
    CONSTRAINT zone_census_pobtot_check CHECK ((pobtot >= 0)),
    CONSTRAINT zone_census_tvivparhab_check CHECK ((tvivparhab >= 0)),
    CONSTRAINT zone_census_vph_autom_check CHECK ((vph_autom >= 0)),
    CONSTRAINT zone_census_vph_bici_check CHECK ((vph_bici >= 0)),
    CONSTRAINT zone_census_vph_moto_check CHECK ((vph_moto >= 0))
);


--
-- Name: TABLE zone_census; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON TABLE geo.zone_census IS 'Población y vivienda del Censo 2020 (INEGI) por zona';


--
-- Name: COLUMN zone_census.zone_code; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.zone_census.zone_code IS 'Zona (PK compuesta, FK a geo.mobility_zones.code)';


--
-- Name: COLUMN zone_census.source; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.zone_census.source IS 'Levantamiento (PK compuesta), p. ej. INEGI-CPV-2020';


--
-- Name: COLUMN zone_census.pobtot; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.zone_census.pobtot IS 'Población total (NULL si INEGI la protege por confidencialidad)';


--
-- Name: COLUMN zone_census.tvivparhab; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.zone_census.tvivparhab IS 'Viviendas particulares habitadas';


--
-- Name: COLUMN zone_census.vph_autom; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.zone_census.vph_autom IS 'Viviendas con automóvil o camioneta';


--
-- Name: COLUMN zone_census.vph_moto; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.zone_census.vph_moto IS 'Viviendas con motocicleta o motoneta';


--
-- Name: COLUMN zone_census.vph_bici; Type: COMMENT; Schema: geo; Owner: -
--

COMMENT ON COLUMN geo.zone_census.vph_bici IS 'Viviendas con bicicleta como medio de transporte';


--
-- Name: mobility_zones mobility_zones_code_key; Type: CONSTRAINT; Schema: geo; Owner: -
--

ALTER TABLE ONLY geo.mobility_zones
    ADD CONSTRAINT mobility_zones_code_key UNIQUE (code);


--
-- Name: mobility_zones mobility_zones_pkey; Type: CONSTRAINT; Schema: geo; Owner: -
--

ALTER TABLE ONLY geo.mobility_zones
    ADD CONSTRAINT mobility_zones_pkey PRIMARY KEY (id);


--
-- Name: zone_census zone_census_pkey; Type: CONSTRAINT; Schema: geo; Owner: -
--

ALTER TABLE ONLY geo.zone_census
    ADD CONSTRAINT zone_census_pkey PRIMARY KEY (zone_code, source);


--
-- Name: mobility_zones_geom_gix; Type: INDEX; Schema: geo; Owner: -
--

CREATE INDEX mobility_zones_geom_gix ON geo.mobility_zones USING gist (geom);


--
-- Name: mobility_zones_geom_utm_gix; Type: INDEX; Schema: geo; Owner: -
--

CREATE INDEX mobility_zones_geom_utm_gix ON geo.mobility_zones USING gist (geom_utm);


--
-- Name: mobility_zones_kind_idx; Type: INDEX; Schema: geo; Owner: -
--

CREATE INDEX mobility_zones_kind_idx ON geo.mobility_zones USING btree (kind);


--
-- Name: zone_census zone_census_zone_code_fkey; Type: FK CONSTRAINT; Schema: geo; Owner: -
--

ALTER TABLE ONLY geo.zone_census
    ADD CONSTRAINT zone_census_zone_code_fkey FOREIGN KEY (zone_code) REFERENCES geo.mobility_zones(code) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

