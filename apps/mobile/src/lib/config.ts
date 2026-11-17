const DEFAULT_API = 'http://10.0.2.2:8000/api/v1';

/** Configuración pública (EXPO_PUBLIC_*). Nunca contiene secretos. */
export const config = {
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API).replace(/\/+$/, ''),
  /** O1: CARTO Voyager (claro) y Dark Matter (oscuro), con datos de OpenStreetMap (ADR-005, nota 2026-11-16). */
  tileUrl: process.env.EXPO_PUBLIC_TILE_URL ?? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  tileUrlDark: process.env.EXPO_PUBLIC_TILE_URL_DARK ?? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '© OpenStreetMap contributors © CARTO',
  /** Margen antes de la expiración del access token para renovarlo de forma proactiva. */
  accessTokenSkewMs: 30_000,
} as const;

/**
 * SECURITY.md §4: HTTPS obligatorio en producción. Los builds `development`/`preview`
 * (APP_VARIANT) pueden usar HTTP contra la API local; `production` no arranca con HTTP.
 * app.config.ts además impide generar un build de producción sin URL HTTPS.
 */
const variant = process.env.EXPO_PUBLIC_APP_VARIANT ?? (__DEV__ ? 'development' : 'production');
if (variant === 'production' && !config.apiBaseUrl.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL debe usar HTTPS en producción.');
}
