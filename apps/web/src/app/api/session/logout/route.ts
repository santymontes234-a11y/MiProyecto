import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookies, errorResponse, forward, REFRESH_COOKIE } from "@/lib/bff";
import { isSameOriginRequest } from "@/lib/auth/csrf";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "FORBIDDEN", "Solicitud rechazada");
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  // Revoca el refresh en la API; si falla, igual se cierra la sesión local.
  if (refreshToken) await forward("/auth/logout", { refresh_token: refreshToken }, request).catch(() => null);
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookies(res);
  return res;
}
