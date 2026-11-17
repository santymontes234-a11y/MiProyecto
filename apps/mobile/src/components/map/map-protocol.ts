import type { BBox, Position } from '@ecomove/shared';

/** Protocolo tipado RN ⇄ WebView (ADR-005). Todas las coordenadas son [lng, lat]. */

export type MarkerKind = 'origin' | 'destination' | 'user' | 'poi';

export interface MapMarker {
  id: string;
  coord: Position;
  kind: MarkerKind;
  label?: string;
  color?: string;
}

export interface MapLine {
  id: string;
  coords: Position[];
  color: string;
  weight?: number;
  dashed?: boolean;
}

export interface MapThemeColors {
  dark: boolean;
  primary: string;
  origin: string;
  destination: string;
  user: string;
  surface: string;
  text: string;
}

export type ToWebMessage =
  | { type: 'init'; center: Position; zoom: number; tileUrl: string; tileUrlDark: string; attribution: string; theme: MapThemeColors }
  | { type: 'setView'; center: Position; zoom?: number }
  | { type: 'fitBounds'; coords: Position[]; padding?: number }
  | { type: 'setMarkers'; layer: 'trip' | 'pois' | 'user'; markers: MapMarker[] }
  | { type: 'setLines'; layer: 'route' | 'cycleways'; lines: MapLine[] }
  | { type: 'setTheme'; theme: MapThemeColors };

export type FromWebMessage =
  | { type: 'ready' }
  | { type: 'moveend'; bbox: BBox; zoom: number; center: Position }
  | { type: 'tap'; coord: Position }
  | { type: 'markerPress'; id: string; layer: string }
  | { type: 'error'; message: string };

const FROM_WEB_TYPES = new Set(['ready', 'moveend', 'tap', 'markerPress', 'error']);

/** Valida mensajes entrantes del WebView: nunca se confía en su forma. */
export function parseFromWeb(raw: string): FromWebMessage | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const type = (data as { type?: unknown }).type;
    if (typeof type !== 'string' || !FROM_WEB_TYPES.has(type)) return null;
    return data as FromWebMessage;
  } catch {
    return null;
  }
}
