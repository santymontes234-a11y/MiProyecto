/**
 * Sanea el parámetro ?next= para evitar open redirects: solo rutas internas
 * relativas ("/app/..."), nunca "//dominio" ni URLs absolutas.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  if (next.startsWith("/api/") || next === "/login" || next === "/registro") return fallback;
  return next;
}
