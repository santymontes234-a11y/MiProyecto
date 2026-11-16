import { ApiError } from "@ecomove/shared";

/**
 * Extrae errores por campo de un `422 VALIDATION_ERROR` del contrato
 * (`details: [{ loc: ["body", "<campo>"], msg }]`). Devuelve { campo: mensaje }.
 */
export function fieldErrorsFromApi(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.status !== 422 || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as unknown[]) {
    if (typeof d !== "object" || d === null) continue;
    const loc = (d as { loc?: unknown }).loc;
    const msg = (d as { msg?: unknown }).msg;
    if (!Array.isArray(loc)) continue;
    const field = [...loc].reverse().find((p): p is string => typeof p === "string" && p !== "body");
    if (field && !(field in out)) out[field] = typeof msg === "string" && msg ? msg : "Valor no válido";
  }
  return out;
}
