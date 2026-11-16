import { modeColors, POI_CATEGORY_LABELS, type BBox, type PoiCategory, type PoiFeature } from '@ecomove/shared';
import { useCallback, useMemo, useState } from 'react';

import type { MapLine, MapMarker } from '@/components/map/map-protocol';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_LAYER_ZOOM, useCycleways, usePois } from './useMapLayers';

/** Color e icono por categoría de POI (consistentes en mapa y leyenda). */
export function poiColor(category: PoiCategory, colors: { info: string; accent: string; warning: string; primary: string; text: string }): string {
  switch (category) {
    case 'BUS_STOP':
      return colors.info;
    case 'BIKE_SHARING':
      return colors.accent;
    case 'EV_CHARGER':
      return colors.warning;
    case 'REPAIR_STATION':
      return colors.text;
    case 'BIKE_PARKING':
    default:
      return colors.primary;
  }
}

export const POI_ICONS: Record<PoiCategory, 'bicycle' | 'bus' | 'flash' | 'construct' | 'lock-closed'> = {
  BIKE_PARKING: 'lock-closed',
  BIKE_SHARING: 'bicycle',
  BUS_STOP: 'bus',
  EV_CHARGER: 'flash',
  REPAIR_STATION: 'construct',
};

/** Estado y datos de las capas de infraestructura (ciclovías + POIs) para el viewport actual. */
export function useInfrastructure(initialCategories: PoiCategory[] = ['BIKE_PARKING', 'BIKE_SHARING', 'BUS_STOP', 'REPAIR_STATION']) {
  const { colors } = useTheme();
  const [viewport, setViewport] = useState<{ bbox: BBox | null; zoom: number }>({ bbox: null, zoom: 13 });
  const [showCycleways, setShowCycleways] = useState(true);
  const [categories, setCategories] = useState<PoiCategory[]>(initialCategories);

  const pois = usePois(viewport.bbox, viewport.zoom, categories);
  const cycleways = useCycleways(viewport.bbox, viewport.zoom, showCycleways);

  const onMoveEnd = useCallback((bbox: BBox, zoom: number) => setViewport({ bbox, zoom }), []);

  const toggleCategory = useCallback((c: PoiCategory) => {
    setCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }, []);

  const poiMarkers = useMemo<MapMarker[]>(
    () =>
      (pois.data?.features ?? [])
        .filter((f) => categories.includes(f.properties.category))
        .map((f) => ({
          id: f.id,
          coord: f.geometry.coordinates,
          kind: 'poi',
          label: f.properties.name,
          color: poiColor(f.properties.category, colors),
        })),
    [pois.data, categories, colors],
  );

  const cyclewayLines = useMemo<MapLine[]>(
    () =>
      showCycleways
        ? (cycleways.data?.features ?? []).map((f) => ({
            id: f.id,
            coords: f.geometry.coordinates,
            color: modeColors.BICYCLE,
            weight: 4,
            dashed: !f.properties.is_protected,
          }))
        : [],
    [cycleways.data, showCycleways],
  );

  const findPoi = useCallback((id: string): PoiFeature | undefined => pois.data?.features.find((f) => f.id === id), [pois.data]);

  const tooFar = viewport.zoom < MIN_LAYER_ZOOM;
  const loading = pois.isFetching || cycleways.isFetching;
  const error = pois.error ?? cycleways.error;
  // Estado vacío (no error): la API respondió sin elementos para las capas activas en esta zona.
  const anyLayerEnabled = showCycleways || categories.length > 0;
  const empty =
    anyLayerEnabled && !loading && !error && !tooFar && poiMarkers.length === 0 && cyclewayLines.length === 0 && !!viewport.bbox;

  return {
    onMoveEnd,
    poiMarkers,
    cyclewayLines,
    findPoi,
    showCycleways,
    setShowCycleways,
    categories,
    toggleCategory,
    tooFar,
    loading,
    error,
    empty,
    categoryLabel: (c: PoiCategory) => POI_CATEGORY_LABELS[c],
  };
}
