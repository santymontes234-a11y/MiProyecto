/** Formateadores puros de presentación (locale es-MX). No contienen reglas de negocio. */
const LOCALE = 'es-MX';

function decimal(value: number, maxDigits: number): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: maxDigits });
}

export function formatCo2(grams: number): string {
  if (grams >= 1_000_000) return `${decimal(grams / 1_000_000, 1)} t`;
  if (grams >= 1_000) return `${decimal(grams / 1_000, 1)} kg`;
  return `${decimal(grams, 0)} g`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1_000) return `${decimal(meters / 1_000, 1)} km`;
  return `${decimal(meters, 0)} m`;
}

export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}
