import type { HeatmapResponse } from "@ecomove/shared";
import { heatClass } from "./ramp";

/** Alternativa en tabla al mapa de calor (DESIGN_SYSTEM: nunca solo color ni solo mapa). */
export function HeatmapTable({ data, limit = 10 }: { data: HeatmapResponse; limit?: number }) {
  const max = data.max_weight || 1;
  const rows = [...data.features].sort((a, b) => b.properties.weight - a.properties.weight).slice(0, limit);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left font-semibold">Celdas con más viajes ({rows.length} de {data.features.length})</caption>
        <thead>
          <tr className="text-left text-ink-muted">
            <th scope="col" className="py-1">Centro de la celda (lat, lng)</th>
            <th scope="col" className="py-1">Intensidad</th>
            <th scope="col" className="py-1 text-right">Viajes</th>
            <th scope="col" className="py-1 text-right">Personas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={f.id ?? i} className="border-t border-line">
              <td className="py-1.5 tabular-nums">{f.geometry.coordinates[1].toFixed(4)}, {f.geometry.coordinates[0].toFixed(4)}</td>
              <td className="py-1.5">{heatClass(f.properties.weight / max).label}</td>
              <td className="py-1.5 text-right tabular-nums">{f.properties.weight}</td>
              <td className="py-1.5 text-right tabular-nums">{f.properties.users}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
