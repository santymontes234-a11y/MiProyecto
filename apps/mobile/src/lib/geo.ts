import { LIMITS, type BBox, type LineStringGeometry, type Position } from '@ecomove/shared';

/**
 * Utilidades geométricas de PRESENTACIÓN. La distancia oficial de un viaje la calcula el backend
 * con PostGIS (ARCHITECTURE §5); aquí solo se usa para mostrar el progreso y filtrar ruido GPS.
 * Coordenadas siempre [lng, lat] (GeoJSON).
 */
const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineM(a: Position, b: Position): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthM(coords: readonly Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const cur = coords[i];
    if (prev && cur) total += haversineM(prev, cur);
  }
  return total;
}

/** Distancia perpendicular aproximada (proyección equirectangular local) en metros. */
function perpendicularM(p: Position, a: Position, b: Position): number {
  const lat0 = toRad((a[1] + b[1]) / 2);
  const x = (pt: Position) => toRad(pt[0]) * Math.cos(lat0) * EARTH_RADIUS_M;
  const y = (pt: Position) => toRad(pt[1]) * EARTH_RADIUS_M;
  const [ax, ay, bx, by, px, py] = [x(a), y(a), x(b), y(b), x(p), y(p)];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker iterativo (sin recursión, apto para trazas largas). */
export function simplify(coords: readonly Position[], toleranceM: number): Position[] {
  if (coords.length <= 2) return coords.slice();
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop() as [number, number];
    const a = coords[start];
    const b = coords[end];
    if (!a || !b) continue;
    let maxD = 0;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const p = coords[i];
      if (!p) continue;
      const d = perpendicularM(p, a, b);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([start, idx], [idx, end]);
    }
  }
  return coords.filter((_, i) => keep[i] === 1);
}

/**
 * Garantiza el límite del contrato (máx. 10 000 puntos) aumentando la tolerancia
 * de simplificación hasta cumplirlo.
 */
export function fitToPointLimit(coords: readonly Position[], max: number = LIMITS.MAX_ROUTE_POINTS): Position[] {
  if (coords.length <= max) return coords.slice();
  let tolerance = 2;
  let out = simplify(coords, tolerance);
  while (out.length > max) {
    tolerance *= 2;
    out = simplify(coords, tolerance);
  }
  return out;
}

export function toLineString(coords: readonly Position[]): LineStringGeometry {
  return { type: 'LineString', coordinates: coords.map((c) => [c[0], c[1]] as Position) };
}

/** Línea recta origen→destino, usada solo para la previsualización (sin ruteo en v1). */
export function straightLine(from: Position, to: Position): Position[] {
  return [from, to];
}

export const MAX_BBOX_SPAN_DEG = 0.5;

/** Recorta un bbox al tamaño máximo aceptado por /map (0.5°×0.5°) alrededor de su centro. */
export function clampBBox(bbox: BBox, maxSpan = MAX_BBOX_SPAN_DEG): BBox {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cx = (minLng + maxLng) / 2;
  const cy = (minLat + maxLat) / 2;
  const hw = Math.min((maxLng - minLng) / 2, maxSpan / 2 - 1e-6);
  const hh = Math.min((maxLat - minLat) / 2, maxSpan / 2 - 1e-6);
  return [round6(cx - hw), round6(cy - hh), round6(cx + hw), round6(cy + hh)];
}

/** Redondea el bbox a una rejilla para reutilizar la caché entre movimientos pequeños del mapa. */
export function snapBBox(bbox: BBox, step = 0.01): BBox {
  const down = (v: number) => round6(Math.floor(v / step) * step);
  const up = (v: number) => round6(Math.ceil(v / step) * step);
  return [down(bbox[0]), down(bbox[1]), up(bbox[2]), up(bbox[3])];
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function formatCoord(p: Position): string {
  return `${p[1].toFixed(5)}, ${p[0].toFixed(5)}`;
}
