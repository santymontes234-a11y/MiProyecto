/** Cabecera que el cliente de sesión envía siempre; un formulario de otro sitio no puede añadirla. */
export const CSRF_HEADER = "x-ecomove-csrf";

/**
 * Defensa CSRF de /api/session/* (además de SameSite=Lax): exige la cabecera propia y
 * un Origin igual al host del sitio.
 */
export function isSameOriginRequest(req: Request): boolean {
  if (req.headers.get(CSRF_HEADER) !== "1") return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
