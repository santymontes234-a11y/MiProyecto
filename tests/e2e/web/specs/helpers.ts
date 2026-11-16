import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const API = (process.env.E2E_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");
/** Contraseña de PRUEBA que cumple la política. Nunca datos reales. */
export const TEST_PASSWORD = "QaPrueba-2026-segura";

export function uniqueEmail(): string {
  return `qa-web-${randomUUID().slice(0, 12)}@example.com`;
}

/** Reintenta ante 429 respetando Retry-After (no evade el rate limit). */
export async function apiPost(request: APIRequestContext, path: string, data: unknown) {
  for (let i = 0; i < 6; i++) {
    const res = await request.post(`${API}${path}`, { data });
    if (res.status() !== 429) return res;
    const wait = Number(res.headers()["retry-after"] ?? "10");
    await new Promise((r) => setTimeout(r, Math.min(wait, 65) * 1000));
  }
  throw new Error(`rate limit persistente en ${path}`);
}

/** Crea un usuario directamente en la API (preparación de datos). */
export async function createUser(request: APIRequestContext, fullName = "Usuaria Web QA") {
  const email = uniqueEmail();
  const res = await apiPost(request, "/auth/register", { email, password: TEST_PASSWORD, full_name: fullName });
  expect(res.status(), await res.text()).toBe(201);
  return { email, password: TEST_PASSWORD };
}

export async function loginViaUi(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Ningún token en almacenamiento accesible por JavaScript (ADR-003, SECURITY.md §4). */
export async function expectNoTokensInBrowserStorage(page: Page) {
  const leaked = await page.evaluate(() => {
    const dump = (s: Storage) => Object.keys(s).map((k) => `${k}=${s.getItem(k) ?? ""}`).join(";");
    return { local: dump(localStorage), session: dump(sessionStorage), cookie: document.cookie };
  });
  for (const [where, value] of Object.entries(leaked)) {
    expect(value, `token expuesto en ${where}`).not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
    expect(value, `refresh expuesto en ${where}`).not.toContain("ecomove_rt");
  }
}
