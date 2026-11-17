"use client";

import { MODE_LABELS, type BikeLaneCoverage as Coverage } from "@ecomove/shared";
import { useThemeColors } from "@/hooks/useColorScheme";

/**
 * Cobertura de ciclovías (§13 `/bike-lane-coverage`): proporción de la distancia de cada modo
 * que va sobre una ciclovía (± `buffer_m`). Barra + porcentaje escrito + tabla.
 */
export function BikeLaneCoverageTable({ data }: { data: Coverage }) {
  const c = useThemeColors();
  if (data.items.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left font-semibold">
          Distancia recorrida sobre ciclovía, por modo (tolerancia {data.buffer_m} m)
        </caption>
        <thead>
          <tr className="text-left text-ink-muted">
            <th scope="col" className="py-1">Modo</th>
            <th scope="col" className="py-1 text-right">Viajes</th>
            <th scope="col" className="py-1">Sobre ciclovía</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it) => {
            const pct = Math.round(it.covered_share * 1000) / 10;
            return (
              <tr key={it.mode} className="border-t border-line">
                <td className="py-1.5">{MODE_LABELS[it.mode]}</td>
                <td className="py-1.5 text-right tabular-nums">{it.trips_count}</td>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-32 overflow-hidden rounded bg-subtle" aria-hidden="true">
                      <span className="block h-full" style={{ width: `${pct}%`, background: c.primary }} />
                    </span>
                    <span className="tabular-nums">{pct.toLocaleString("es-MX")} %</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
