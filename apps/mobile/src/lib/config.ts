const DEFAULT_API = 'http://10.0.2.2:8000/api/v1';

/**
 * Tiles del mapa (O1, ADR-005):
 * - Con EXPO_PUBLIC_STADIA_API_KEY: Stadia Alidade Smooth / Smooth Dark (el WebView no envía Referer,
 *   así que Stadia exige la clave). La clave es pública por diseño del proveedor, pero vive solo en
 *   apps/mobile/.env o en variables de EAS, nunca en el repo.
 * - Sin clave: tile.openstreetmap.org (sin clave). En oscuro se invierte por CSS (tileUrlDark = null).
 * CARTO quedó descartado: exige clave desde 2026-11.
 */
function tiles(): { tileUrl: string; tileUrlDark: string | null; tileAttribution: string } {
  const key = process.env.EXPO_PUBLIC_STADIA_API_KEY?.trim();
  if (key) {
    const k = encodeURIComponent(key);
    return {
      tileUrl: `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${k}`,
      tileUrlDark: `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${k}`,
      tileAttribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap contributors',
    };
  }
  return { tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', tileUrlDark: null, tileAttribution: '© OpenStreetMap contributors' };
}

/** Configuración pública (EXPO_PUBLIC_*). Nunca contiene secretos. */
export const config = {
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API).replace(/\/+$/, ''),
  ...tiles(),
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
