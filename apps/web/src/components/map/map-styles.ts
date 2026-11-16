import { POI_CATEGORY_LABELS, type ColorScheme, type PoiCategory } from "@ecomove/shared";

/** Color por categoría de POI, derivado de tokens. Siempre acompañado de etiqueta (leyenda/tooltip). */
export function poiColor(category: PoiCategory, c: ColorScheme): string {
  const map: Record<PoiCategory, string> = {
    BIKE_PARKING: c.primary,
    BIKE_SHARING: c.accent,
    BUS_STOP: c.secondary,
    EV_CHARGER: c.warning,
    REPAIR_STATION: c.primaryStrong,
  };
  return map[category];
}

/** Letra que se dibuja en el marcador para no depender solo del color. */
export const POI_GLYPH: Record<PoiCategory, string> = {
  BIKE_PARKING: "E",
  BIKE_SHARING: "B",
  BUS_STOP: "A",
  EV_CHARGER: "C",
  REPAIR_STATION: "R",
};

export { POI_CATEGORY_LABELS };
