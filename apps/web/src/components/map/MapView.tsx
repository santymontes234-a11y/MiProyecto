"use client";

import dynamic from "next/dynamic";
import { POI_CATEGORIES, modeColors } from "@ecomove/shared";
import { Skeleton } from "@/components/ui/StateViews";
import { useThemeColors } from "@/hooks/useColorScheme";
import type { LeafletMapProps } from "./LeafletMap";
import { POI_CATEGORY_LABELS, POI_GLYPH, poiColor } from "./map-styles";

/** Leaflet depende de `window`: se carga solo en el cliente. */
export const MapView = dynamic<LeafletMapProps>(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-[460px] w-full" />,
});

export function MapLegend() {
  const c = useThemeColors();
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted" aria-label="Leyenda del mapa">
      {POI_CATEGORIES.map((cat) => (
        <li key={cat} className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-on-brand" style={{ background: poiColor(cat, c) }} aria-hidden="true">
            {POI_GLYPH[cat]}
          </span>
          {POI_CATEGORY_LABELS[cat]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-1 w-6 rounded" style={{ background: modeColors.BICYCLE }} aria-hidden="true" /> Ciclovía protegida
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-1 w-6 rounded" style={{ background: `repeating-linear-gradient(90deg, ${modeColors.BICYCLE} 0 6px, transparent 6px 12px)` }} aria-hidden="true" /> Ciclovía no protegida
      </li>
    </ul>
  );
}
