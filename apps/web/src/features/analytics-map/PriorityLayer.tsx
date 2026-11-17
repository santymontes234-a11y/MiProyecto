"use client";

import { Polygon, Tooltip } from "react-leaflet";
import type { PriorityResponse } from "@ecomove/shared";
import { useThemeColors } from "@/hooks/useColorScheme";
import { PRIORITY_GLYPH, PRIORITY_LABELS, priorityStyle } from "./ramp";

type Cell = PriorityResponse["features"][number];

function ring(cell: Cell): [number, number][] {
  return (cell.geometry.coordinates[0] ?? []).map(([lng, lat]) => [lat, lng] as [number, number]);
}

/**
 * Índice de prioridad de infraestructura (§13 `/infrastructure-priority`) por celda.
 * Cada clase usa relleno, grosor y patrón de borde distintos (las de datos insuficientes van
 * punteadas) y el tooltip escribe la clase, la puntuación y la muestra.
 */
export function PriorityLayer({ data, onSelect }: { data: PriorityResponse; onSelect?: (cell: Cell) => void }) {
  const c = useThemeColors();
  return (
    <>
      {data.features.map((f, i) => {
        const s = priorityStyle(c, f.properties.label);
        return (
          <Polygon
            key={f.id ?? i}
            positions={ring(f)}
            pathOptions={{ color: s.stroke, weight: s.weight, dashArray: s.dashArray, fillColor: s.fill, fillOpacity: s.fillOpacity }}
            eventHandlers={onSelect ? { click: () => onSelect(f) } : undefined}
          >
            <Tooltip>
              {PRIORITY_GLYPH[f.properties.label]} {PRIORITY_LABELS[f.properties.label]}
              {f.properties.score !== null && ` · índice ${f.properties.score.toFixed(2)}`}
              {` · ${f.properties.sample.users} personas, ${f.properties.sample.trip_ends} extremos de viaje`}
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}
