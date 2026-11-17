"use client";

import type { PriorityResponse } from "@ecomove/shared";
import { useThemeColors } from "@/hooks/useColorScheme";
import { PRIORITY_GLYPH, PRIORITY_LABELS, PRIORITY_ORDER, heatColor, priorityStyle } from "./ramp";

/* Leyendas fuera de los módulos de capas: no importan react-leaflet y se pueden renderizar en el servidor. */

export function HeatmapLegend({ cellM, maxWeight }: { cellM: number; maxWeight: number }) {
  const c = useThemeColors();
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted" aria-label="Leyenda del mapa de calor">
      {[
        { label: "Baja", t: 0.15, size: 10 },
        { label: "Media", t: 0.5, size: 16 },
        { label: "Alta", t: 0.95, size: 24 },
      ].map((k) => (
        <li key={k.label} className="flex items-center gap-1.5">
          <span className="inline-block rounded-full border" style={{ width: k.size, height: k.size, background: heatColor(c, k.t), borderColor: c.primaryStrong }} aria-hidden="true" />
          Intensidad {k.label.toLowerCase()}
        </li>
      ))}
      <li>Celdas de {cellM} m · máximo {maxWeight} viajes por celda</li>
    </ul>
  );
}

export function PriorityLegend({ data }: { data: PriorityResponse }) {
  const c = useThemeColors();
  const counts = Object.fromEntries(PRIORITY_ORDER.map((l) => [l, data.features.filter((f) => f.properties.label === l).length]));
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted" aria-label="Leyenda del índice de prioridad">
      {PRIORITY_ORDER.map((l) => {
        const s = priorityStyle(c, l);
        return (
          <li key={l} className="flex items-center gap-1.5">
            <span
              className="grid size-5 place-items-center text-[10px] font-bold"
              style={{ background: s.fill, opacity: Math.max(s.fillOpacity, 0.35) + 0.4, border: `${Math.ceil(s.weight)}px ${s.dashArray ? "dashed" : "solid"} ${s.stroke}`, color: c.text }}
              aria-hidden="true"
            >
              {PRIORITY_GLYPH[l]}
            </span>
            {PRIORITY_LABELS[l]} ({counts[l]})
          </li>
        );
      })}
    </ul>
  );
}
