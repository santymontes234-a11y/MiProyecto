import { POI_CATEGORIES, type BBox, type PoiCategory } from '@ecomove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { clampBBox, snapBBox } from '@/lib/geo';
import { queryKeys } from '@/lib/query-client';

/** Por debajo de este zoom no se piden capas (demasiados elementos y bbox grande). */
export const MIN_LAYER_ZOOM = 12;

export function normalizeBBox(bbox: BBox | null): BBox | null {
  return bbox ? snapBBox(clampBBox(bbox)) : null;
}

export function usePois(bbox: BBox | null, zoom: number, categories: readonly PoiCategory[] = POI_CATEGORIES) {
  const b = normalizeBBox(bbox);
  const key = b?.join(',') ?? '';
  return useQuery({
    queryKey: queryKeys.pois(key, [...categories].sort().join(',')),
    queryFn: () => api.map.pois({ bbox: b as BBox, category: [...categories], limit: 300 }),
    enabled: !!b && zoom >= MIN_LAYER_ZOOM && categories.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useCycleways(bbox: BBox | null, zoom: number, enabled = true) {
  const b = normalizeBBox(bbox);
  const key = b?.join(',') ?? '';
  return useQuery({
    queryKey: queryKeys.cycleways(key),
    queryFn: () => api.map.cycleways(b as BBox),
    enabled: enabled && !!b && zoom >= MIN_LAYER_ZOOM,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
  });
}
