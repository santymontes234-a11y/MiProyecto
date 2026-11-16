/**
 * Exportación en el cliente (presentación, aprobada por el arquitecto): se genera el CSV a
 * partir de datos ya devueltos por la API. El PDF se obtiene con la vista de impresión.
 */
export type Cell = string | number | boolean | null | undefined;

/** Evita «CSV injection»: Excel interpreta como fórmula lo que empieza por = + - @ tab o CR. */
export function sanitizeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(sanitizeCell).join(","), ...rows.map((r) => r.map(sanitizeCell).join(","))];
  // BOM para que Excel detecte UTF-8 (acentos, CO₂).
  return "﻿" + lines.join("\r\n");
}

export function downloadText(content: string, filename: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Recorre todas las páginas de un endpoint paginado (page_size ≤ 100 en el contrato).
 * `maxItems` limita el volumen exportado desde el navegador.
 */
export async function fetchAllPages<T>(
  load: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  { pageSize = 100, maxItems = 10_000 }: { pageSize?: number; maxItems?: number } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const res = await load(page, pageSize);
    out.push(...res.items);
    if (res.items.length < pageSize || out.length >= res.total || out.length >= maxItems) break;
  }
  return out.slice(0, maxItems);
}

export function timestampedName(base: string, ext: string, now = new Date()): string {
  return `${base}-${now.toISOString().slice(0, 10)}.${ext}`;
}
