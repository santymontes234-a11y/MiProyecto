import { cookies } from "next/headers";
import { clearSessionCookies, errorResponse, forward, REFRESH_COOKIE, sessionResponse } from "@/lib/bff";
import { isSameOriginRequest } from "@/lib/auth/csrf";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "FORBIDDEN", "Solicitud rechazada");
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    const res = errorResponse(401, "UNAUTHORIZED", "Sin sesión");
    clearSessionCookies(res);
    return res;
  }
  return sessionResponse(await forward("/auth/refresh", { refresh_token: refreshToken }, request));
}
