import type { BBox } from "@ecomove/shared";

/** Límite del contrato §5 para bbox (0.5° × 0.5°). */
export const MAX_BBOX_DEG = 0.5;

export function bboxTooLarge([minLng, minLat, maxLng, maxLat]: BBox): boolean {
  return maxLng - minLng > MAX_BBOX_DEG || maxLat - minLat > MAX_BBOX_DEG;
}

/** Bbox que encierra una lista de posiciones [lng, lat]. */
export function bboxOf(coords: readonly [number, number][]): BBox | null {
  if (coords.length === 0) return null;
  let [minLng, minLat] = coords[0]!;
  let [maxLng, maxLat] = coords[0]!;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}
