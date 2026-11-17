/**
 * Formateadores genéricos de la web. CO₂, distancia y duración se formatean SIEMPRE con
 * formatCo2 / formatDistance / formatDuration de @ecomove/shared (mismas cifras que mobile).
 */
const LOCALE = "es-MX";
const TZ = "America/Mexico_City";

const nf = new Intl.NumberFormat(LOCALE);
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const dtf = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
const df = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeZone: TZ });
// Contrato 1.1 §0: los periodos se cortan en America/Mexico_City (devueltos en UTC), así que
// se etiquetan en esa zona horaria.
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: TZ });
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "2-digit", timeZone: TZ });

export const formatNumber = (n: number | null | undefined): string => (n == null ? "—" : nf.format(n));
export const formatCompact = (n: number | null | undefined): string => (n == null ? "—" : compact.format(n));

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)} %`;
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const formatDateTime = (iso: string | null | undefined): string => {
  const d = parse(iso);
  return d ? dtf.format(d) : "—";
};
export const formatDate = (iso: string | null | undefined): string => {
  const d = parse(iso);
  return d ? df.format(d) : "—";
};

/** Etiqueta corta de un periodo de serie temporal según la granularidad. */
export function formatPeriod(iso: string, granularity: "day" | "week" | "month"): string {
  const d = parse(iso);
  if (!d) return iso;
  if (granularity === "month") return monthYear.format(d);
  return dayMonth.format(d);
}

/** Inicio de un rango relativo (en días) como ISO 8601 UTC, para from/to del contrato. */
export function daysAgoIso(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Convierte 'YYYY-MM-DD' de un <input type="date"> a ISO 8601 UTC (inicio o fin del día). */
export function dateInputToIso(value: string, endOfDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return `${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
}

/** Valor para <input type="datetime-local"> en la hora local del navegador. */
export function toDateTimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** De <input type="datetime-local"> (hora local) a ISO UTC; undefined si no es válida. */
export function dateTimeLocalToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
