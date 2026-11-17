import type { Granularity, TimeSeriesPoint } from "@ecomove/shared";

/**
 * Contrato 1.1 §0: los periodos se cortan en America/Mexico_City y se devuelven en UTC
 * (p. ej. el día 15 local = 2026-11-15T06:00:00Z). Querétaro no tiene horario de verano
 * desde 2022: desfase fijo UTC−6.
 */
export const AGGREGATE_TZ = "America/Mexico_City";
const OFFSET_MS = -6 * 60 * 60 * 1000;

/** Inicio de cubeta (día, semana desde lunes, mes) en hora local, expresado en UTC. */
export function bucketStart(d: Date, g: Granularity): Date {
  const local = new Date(d.getTime() + OFFSET_MS);
  const x = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  if (g === "week") x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  if (g === "month") x.setUTCDate(1);
  return new Date(x.getTime() - OFFSET_MS);
}

function next(d: Date, g: Granularity): Date {
  const local = new Date(d.getTime() + OFFSET_MS);
  if (g === "day") local.setUTCDate(local.getUTCDate() + 1);
  else if (g === "week") local.setUTCDate(local.getUTCDate() + 7);
  else local.setUTCMonth(local.getUTCMonth() + 1);
  return new Date(local.getTime() - OFFSET_MS);
}

/**
 * Presentación: la API omite los periodos sin viajes; se rellenan con ceros entre `from` y `to`
 * para que la serie sea continua. No altera ningún valor devuelto por la API.
 */
export function fillSeries<P extends TimeSeriesPoint>(points: P[], g: Granularity, from: string, to: string, empty: (periodStart: string) => P, maxBuckets = 400): P[] {
  const byKey = new Map(points.map((p) => [bucketStart(new Date(p.period_start), g).getTime(), p]));
  const out: P[] = [];
  const end = new Date(to).getTime();
  for (let d = bucketStart(new Date(from), g); d.getTime() <= end && out.length < maxBuckets; d = next(d, g)) {
    out.push(byKey.get(d.getTime()) ?? empty(d.toISOString().replace(".000Z", "Z")));
  }
  for (const p of points) if (!out.includes(p)) out.push(p);
  return out.sort((a, b) => a.period_start.localeCompare(b.period_start));
}

export const emptyPoint = (period_start: string): TimeSeriesPoint => ({ period_start, trips_count: 0, distance_m: 0, co2_saved_g: 0 });
