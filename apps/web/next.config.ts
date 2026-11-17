import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** Origen de la API (el navegador la llama directo con el access token en memoria, ADR-003). */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1").origin;
  } catch {
    return "http://localhost:8000";
  }
}

/**
 * CSP restrictiva (SECURITY §4). Tiles Stadia Maps (datos OSM) en img-src. 'unsafe-inline' en script-src lo
 * requieren los scripts de hidratación de Next sin nonce; 'unsafe-eval' solo en desarrollo.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.stadiamaps.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin()}${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Imagen Docker de producción (apps/web/Dockerfile): NEXT_OUTPUT=standalone genera un servidor
  // autocontenido. El trazado parte de la raíz del monorepo para incluir @ecomove/shared.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const, outputFileTracingRoot: path.resolve(process.cwd(), "../..") }
    : {}),
  // @ecomove/shared se consume como fuente TypeScript (sin build).
  transpilePackages: ["@ecomove/shared"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/session/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
