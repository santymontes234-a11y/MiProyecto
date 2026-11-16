/** Formateadores de fecha locales (es-MX). Los de CO₂/distancia/duración viven en @ecomove/shared. */
const LOCALE = 'es-MX';

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function formatRelativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays > 1 && diffDays < 7) return `Hace ${diffDays} días`;
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/** Etiqueta corta del periodo de una serie temporal. */
export function formatPeriod(iso: string, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(iso);
  if (granularity === 'month') return d.toLocaleDateString(LOCALE, { month: 'short', timeZone: 'UTC' }).replace('.', '');
  if (granularity === 'day') return d.toLocaleDateString(LOCALE, { weekday: 'narrow', timeZone: 'UTC' });
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
}

/** Cronómetro mm:ss o h:mm:ss. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Saludo según la hora local. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
