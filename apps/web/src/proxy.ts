import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy de Next (antes «middleware»). Solo mejora la UX: sin la cookie indicadora de sesión
 * redirige las rutas privadas a /login. NO autoriza: el rol se obtiene de la API (User) y la
 * API valida cada petición.
 */
const SESSION_HINT_COOKIE = "ecomove_sess";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.get(SESSION_HINT_COOKIE)?.value === "1";
  const isAuthPage = pathname === "/login" || pathname === "/registro";

  if (!hasSession && !isAuthPage) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  // Con ?expired=1 la sesión ya falló en el cliente: no rebotar a /app (evita bucles si la
  // cookie indicadora quedó obsoleta, p. ej. con la API caída).
  if (hasSession && isAuthPage && !req.nextUrl.searchParams.has("expired")) return NextResponse.redirect(new URL("/app", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/login", "/registro"],
};
