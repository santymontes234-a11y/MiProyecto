-- =============================================================================
-- Población del Censo de Población y Vivienda 2020 (INEGI) por zona de análisis.
--
-- * Una fila por zona (geo.mobility_zones.code = CVEGEO) y levantamiento.
-- * Los valores protegidos por confidencialidad («*») o no disponibles («N/D»)
--   se guardan como NULL, nunca como 0.
-- * Nunca se guardan datos DEMO aquí (las zonas DEMO no tienen censo).
-- * Lo llena app/services/geo_analytics/inegi_import.py.
-- Idempotente. Pendiente: envolverlo en una migración de Backend.
-- =============================================================================
CREATE TABLE IF NOT EXISTS geo.zone_census (
    zone_code    text    NOT NULL REFERENCES geo.mobility_zones (code) ON DELETE CASCADE,
    source       text    NOT NULL,             -- 'INEGI-CPV-2020'
    pobtot       integer CHECK (pobtot >= 0),  -- población total
    tvivparhab   integer CHECK (tvivparhab >= 0), -- viviendas particulares habitadas
    vph_autom    integer CHECK (vph_autom >= 0),  -- … que disponen de automóvil o camioneta
    vph_moto     integer CHECK (vph_moto >= 0),   -- … de motocicleta o motoneta
    vph_bici     integer CHECK (vph_bici >= 0),   -- … de bicicleta como medio de transporte
    PRIMARY KEY (zone_code, source)
);
