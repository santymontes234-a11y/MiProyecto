/**
 * Mapa base (observación O1): CARTO Voyager en claro y Dark Matter en oscuro, sobre datos OSM
 * (ADR-005). Mismas URLs que la app Android para que ambos clientes se vean igual.
 */
export const BASEMAPS = {
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;

export const BASEMAP_SUBDOMAINS = "abcd";

export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

export const BASEMAP_MAX_ZOOM = 19;
