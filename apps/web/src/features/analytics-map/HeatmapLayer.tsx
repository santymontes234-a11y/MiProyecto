"use client";

import { CircleMarker, Tooltip } from "react-leaflet";
import type { HeatmapResponse } from "@ecomove/shared";
import { useThemeColors } from "@/hooks/useColorScheme";
import { heatClass, heatColor } from "./ramp";

/**
 * Celdas del mapa de calor (§13.2) como hijos de `<MapView>`. Cada celda codifica la intensidad
 * con tres señales: color (rampa del sistema), radio y la clase escrita en el tooltip.
 * La API ya suprimió las celdas con menos personas que el mínimo (k-anonimato).
 */
export function HeatmapLayer({ data }: { data: HeatmapResponse }) {
  const c = useThemeColors();
  const max = data.max_weight || 1;
  return (
    <>
      {data.features.map((f, i) => {
        const ratio = f.properties.weight / max;
        const k = heatClass(ratio);
        const [lng, lat] = f.geometry.coordinates;
        return (
          <CircleMarker
            key={f.id ?? `${lng},${lat},${i}`}
            center={[lat, lng]}
            radius={k.radius}
            pathOptions={{ color: c.primaryStrong, weight: 1, fillColor: heatColor(c, ratio), fillOpacity: 0.75 }}
          >
            <Tooltip>
              Intensidad {k.label.toLowerCase()} · {f.properties.weight} viajes · {f.properties.users} personas
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
