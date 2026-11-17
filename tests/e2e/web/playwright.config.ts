import { defineConfig, devices } from "@playwright/test";

/**
 * E2E web contra un stack en ejecución (no levanta servidores):
 *   E2E_WEB_URL       URL de la web (def. http://localhost:3000)
 *   E2E_API_BASE_URL  URL de la API para preparar datos (def. http://localhost:8000/api/v1)
 * La API debe tener la URL de la web en CORS_ORIGINS.
 */
export default defineConfig({
  testDir: "./specs",
  // Las evidencias del informe solo se generan bajo demanda (run-local.sh evidence).
  testIgnore: process.env.E2E_EVIDENCE_DIR ? [] : ["**/evidencias.spec.ts"],
  fullyParallel: false,
  workers: 1, // el rate limit de /auth/* (10/min/IP) es real: no se desactiva para las pruebas
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "es-MX",
  },
  // channel "chromium": modo headless con el Chromium completo (no requiere chrome-headless-shell,
  // que Playwright no publica para todas las distros, p. ej. Ubuntu 26.04).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
});
