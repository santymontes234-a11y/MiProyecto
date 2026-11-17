import type { PriorityResponse } from "@ecomove/shared";
import { PRIORITY_LABELS } from "./ramp";

type Cell = PriorityResponse["features"][number];

/**
 * Alternativa en tabla al mapa de prioridad: celdas ordenadas por índice, con la clase escrita,
 * la confianza y la explicación que da la API. Nunca se afirma necesidad con datos insuficientes.
 */
export function PriorityTable({ data, limit = 15, selected }: { data: PriorityResponse; limit?: number; selected?: Cell | null }) {
  const rows = data.features
    .filter((f) => f.properties.score !== null)
    .sort((a, b) => (b.properties.score ?? 0) - (a.properties.score ?? 0))
    .slice(0, limit);
  const insufficient = data.features.length - data.features.filter((f) => f.properties.score !== null).length;
  return (
    <div className="space-y-3">
      {selected && (
        <div className="rounded-md border border-line p-3 text-sm" aria-live="polite">
          <p className="font-semibold">{PRIORITY_LABELS[selected.properties.label]}</p>
          <p className="text-ink-muted">{selected.properties.explanation}</p>
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {selected.properties.components.map((k) => (
              <li key={k.key}>
                {k.label}: {k.available && k.normalized !== null ? `${(k.normalized * 100).toFixed(0)} / 100 (peso ${k.weight})` : "sin dato"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left font-semibold">Celdas con mayor índice ({rows.length})</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="py-1">Clase</th>
                <th scope="col" className="py-1 text-right">Índice</th>
                <th scope="col" className="py-1 text-right">Confianza</th>
                <th scope="col" className="py-1 text-right">Personas</th>
                <th scope="col" className="py-1">Explicación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={f.id ?? i} className="border-t border-line align-top">
                  <td className="py-1.5">{PRIORITY_LABELS[f.properties.label]}</td>
                  <td className="py-1.5 text-right tabular-nums">{f.properties.score?.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">{Math.round(f.properties.confidence * 100)} %</td>
                  <td className="py-1.5 text-right tabular-nums">{f.properties.sample.users}</td>
                  <td className="py-1.5 text-ink-muted">{f.properties.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {insufficient > 0 && (
        <p className="text-xs text-ink-muted">
          {insufficient} celdas sin índice por datos insuficientes: no se puede afirmar necesidad en ellas.
        </p>
      )}
    </div>
  );
}
