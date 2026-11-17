/**
 * Utilidades del BFF de sesión (solo servidor). SIN lógica de negocio: reenvía a la API
 * y gestiona la cookie HttpOnly del refresh token (ADR-003).
 */
import "server-only";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { isTokenPair, type ApiErrorBody, type MessageResponse, type TokenPair } from "@ecomove/shared";

/** Refresh token: HttpOnly y limitado a /api/session (el resto del sitio nunca lo recibe). */
export const REFRESH_COOKIE = "ecomove_rt";
/**
 * Cookie indicadora sin valor sensible ("1") para que el proxy de Next redirija rutas
 * privadas sin sesión. No autoriza nada: la API valida el token en cada petición.
 */
export const SESSION_HINT_COOKIE = "ecomove_sess";

const API = (process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");
const THIRTY_DAYS_S = 60 * 60 * 24 * 30;
const secure = process.env.NODE_ENV === "production";

export function errorResponse(status: number, code: string, message: string): NextResponse {
  const body: ApiErrorBody = { error: { code, message, details: null } };
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * IP real del cliente según el proxy de entrada (nginx): `x-real-ip` o, si falta, el primer valor
 * de `x-forwarded-for`. Solo se devuelve si es una IP válida; nunca se reenvía texto arbitrario. La API
 * solo confía en este header si llega desde FORWARDED_ALLOW_IPS (límite de logins por IP).
 */
export function clientIp(request: Request): string | null {
  // x-real-ip primero: nginx la fija con $remote_addr; el primer valor de x-forwarded-for podría
  // venir del cliente si un proxy usa $proxy_add_x_forwarded_for.
  const candidates = [request.headers.get("x-real-ip"), request.headers.get("x-forwarded-for")?.split(",")[0]];
  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip && ip.length <= 45 && isIP(ip) !== 0) return ip;
  }
  return null;
}

export async function forward(path: string, body: unknown, request?: Request): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const ip = request ? clientIp(request) : null;
  if (ip) headers["X-Forwarded-For"] = ip;
  try {
    return await fetch(`${API}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json({ error: { code: "API_UNAVAILABLE", message: "No se pudo contactar al servidor de EcoMove", details: null } }, { status: 502 });
  }
}

/** Responde al navegador sin el refresh token y lo guarda en cookie. */
export async function sessionResponse(apiRes: Response, status = 200): Promise<NextResponse> {
  // status solo aplica cuando la API devuelve tokens; un 202 conserva su estado.
  const data: unknown = await apiRes.json().catch(() => null);
  if (!apiRes.ok) {
    const res = NextResponse.json(data ?? { error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null } }, { status: apiRes.status, headers: { "cache-control": "no-store" } });
    if (apiRes.status === 401) clearSessionCookies(res);
    return res;
  }
  const body = data as TokenPair | MessageResponse;
  if (!isTokenPair(body)) {
    // 202 de /auth/register con verificación obligatoria: sin tokens, sin cookies.
    return NextResponse.json({ message: body.message }, { status: apiRes.status, headers: { "cache-control": "no-store" } });
  }
  const pair = body;
  const res = NextResponse.json(
    { access_token: pair.access_token, expires_in: pair.expires_in, user: pair.user },
    { status, headers: { "cache-control": "no-store" } },
  );
  res.cookies.set(REFRESH_COOKIE, pair.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/api/session", maxAge: THIRTY_DAYS_S });
  res.cookies.set(SESSION_HINT_COOKIE, "1", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: THIRTY_DAYS_S });
  return res;
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/api/session", maxAge: 0 });
  res.cookies.set(SESSION_HINT_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}
