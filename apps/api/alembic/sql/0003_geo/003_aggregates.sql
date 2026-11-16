-- =============================================================================
-- EcoMove Querétaro — Agregado materializado para analítica de gran volumen
-- -----------------------------------------------------------------------------
-- geo.mv_daily_stats resume viajes por día local, hora, día de la semana, modo
-- y bandera DEMO (ARCHITECTURE.md §10). Series de ciudad, horas pico y reparto
-- modal lo consultan en lugar de recorrer trips completo.
--
-- * Los usuarios activos NO se pueden sumar entre días: se calculan sobre
--   geo.v_trips con el índice (user_id, started_at).
-- * Zona horaria: America/Mexico_City (Querétaro: tiempo del centro, sin
--   horario de verano desde 2022).
-- * Refresco: SELECT geo.refresh_aggregates();  (job programado, p. ej. 15 min)
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS geo.mv_daily_stats;

CREATE MATERIALIZED VIEW geo.mv_daily_stats AS
SELECT
    (t.started_at AT TIME ZONE 'America/Mexico_City')::date                       AS day,
    extract(hour FROM t.started_at AT TIME ZONE 'America/Mexico_City')::smallint   AS hour,
    extract(isodow FROM t.started_at AT TIME ZONE 'America/Mexico_City')::smallint AS weekday,  -- 1 = lunes
    t.mode_code,
    t.is_demo,
    count(*)::bigint       AS trips_count,
    sum(t.distance_m)      AS distance_m,
    sum(t.co2_emitted_g)   AS co2_emitted_g,
    sum(t.co2_saved_g)     AS co2_saved_g
FROM geo.v_trips t
GROUP BY 1, 2, 3, 4, 5
WITH DATA;

-- Requerido por REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX mv_daily_stats_pk ON geo.mv_daily_stats (day, hour, mode_code, is_demo);
CREATE INDEX mv_daily_stats_day ON geo.mv_daily_stats (day);

CREATE OR REPLACE FUNCTION geo.refresh_aggregates() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY geo.mv_daily_stats;
END $$;
