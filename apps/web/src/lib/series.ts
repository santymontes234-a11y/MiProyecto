import type { Granularity, TimeSeriesPoint } from "@ecomove/shared";

/** Inicio de cubeta en UTC (semanas ISO desde lunes, como la API). */
export function bucketStart(d: Date, g: Granularity): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (g === "week") x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  if (g === "month") x.setUTCDate(1);
  return x;
}

function next(d: Date, g: Granularity): Date {
  const x = new Date(d);
  if (g === "day") x.setUTCDate(x.getUTCDate() + 1);
  else if (g === "week") x.setUTCDate(x.getUTCDate() + 7);
  else x.setUTCMonth(x.getUTCMonth() + 1);
  return x;
}

/**
 * Presentación: la API omite los periodos sin viajes; se rellenan con ceros entre `from` y `to`
 * para que la serie sea continua. No altera ningún valor devuelto por la API.
 */
export function fillSeries(points: TimeSeriesPoint[], g: Granularity, from: string, to: string, maxBuckets = 400): TimeSeriesPoint[] {
  const byKey = new Map(points.map((p) => [bucketStart(new Date(p.period_start), g).getTime(), p]));
  const out: TimeSeriesPoint[] = [];
  const end = new Date(to).getTime();
  for (let d = bucketStart(new Date(from), g); d.getTime() <= end && out.length < maxBuckets; d = next(d, g)) {
    out.push(byKey.get(d.getTime()) ?? { period_start: d.toISOString().replace(".000Z", "Z"), trips_count: 0, distance_m: 0, co2_saved_g: 0 });
  }
  // Conserva cualquier punto de la API fuera del rango calculado.
  for (const p of points) if (!out.includes(p)) out.push(p);
  return out.sort((a, b) => a.period_start.localeCompare(b.period_start));
}
