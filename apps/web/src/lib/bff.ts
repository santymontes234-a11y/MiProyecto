/**
 * Utilidades del BFF de sesión (solo servidor). SIN lógica de negocio: reenvía a la API
 * y gestiona la cookie HttpOnly del refresh token (ADR-003).
 */
import "server-only";
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

export async function forward(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
