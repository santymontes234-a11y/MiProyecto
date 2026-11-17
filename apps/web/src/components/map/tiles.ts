/**
 * Mapa base (observación O1), datos OSM (ADR-005): Stadia Maps «Alidade Smooth» en claro y
 * «Alidade Smooth Dark» en oscuro. CARTO se descartó: desde 2026 sus teselas sin API key devuelven
 * «API KEY REQUIRED». Stadia funciona sin clave en localhost y, en producción, autoriza por dominio
 * (se registra en su panel; no hay secreto en el cliente).
 */
export const BASEMAPS = {
  light: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
  dark: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
} as const;

/** Stadia no usa subdominios; Leaflet ignora {s} si no aparece en la URL. */
export const BASEMAP_SUBDOMAINS = "a";

export const BASEMAP_ATTRIBUTION =
  '© <a href="https://stadiamaps.com/" target="_blank" rel="noopener noreferrer">Stadia Maps</a> © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

export const BASEMAP_MAX_ZOOM = 20;
