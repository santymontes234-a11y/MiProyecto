/**
 * Evidencias del CRUD funcional (requisito R15, docs/report/REQUISITOS_ABD.md).
 * Genera capturas en docs/report/evidencias/ y verifica cada operación en la BD con SQL
 * (antes/después), guardando la salida en evidencias/verificacion-resultados.md.
 *
 * Solo se ejecuta con E2E_EVIDENCE_DIR y E2E_DB_CONTAINER (tests/e2e/run-local.sh evidence).
 * Todos los datos son ficticios (dominio ejemplo.mx, nombres «Ejemplo»).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { API, apiPost } from "./helpers";

const DIR = process.env.E2E_EVIDENCE_DIR ?? "";
const DB = process.env.E2E_DB_CONTAINER ?? "";
const ADMIN = { email: "laura.admin@ejemplo.mx", password: "Ejemplo-Admin-2026", name: "Laura Ejemplo (ADMIN)" };
const USER = { email: "ana.ejemplo@ejemplo.mx", password: "Ejemplo-Usuaria-2026", name: "Ana Ejemplo" };
const POI_NAME = "Ciclopuerto Ejemplo Alameda";
const POI_EDITED = "Ciclopuerto Ejemplo Alameda (ampliado)";
const LOG = () => join(DIR, "verificacion-resultados.md");

test.skip(!DIR || !DB, "Solo en modo evidencias (tests/e2e/run-local.sh evidence)");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

function sql(query: string): string {
  return execFileSync("docker", ["exec", DB, "psql", "-U", "qa", "-d", "qa", "-P", "pager=off", "-c", query], {
    encoding: "utf8",
  }).trim();
}

function verify(step: string, query: string): string {
  const out = sql(query);
  appendFileSync(LOG(), `\n**${step}**\n\n\`\`\`sql\n${query}\n\`\`\`\n\n\`\`\`text\n${out}\n\`\`\`\n`);
  return out;
}

async function shot(page: Page, file: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800); // teselas del mapa y animaciones
  await page.screenshot({ path: join(DIR, file), fullPage: false });
}

async function login(page: Page, who: { email: string; password: string }, landing: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(who.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(landing);
}

test.beforeAll(async ({ request }) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(
    LOG(),
    "# Verificación en base de datos de las operaciones CRUD\n\n" +
      "Salida real de `psql` sobre la base efímera usada para generar las capturas " +
      "(tests/e2e/run-local.sh evidence). Datos ficticios.\n",
  );
  // Cuenta ADMIN ficticia: se registra y la promueve el SUPER_ADMIN efímero del entorno de pruebas.
  for (const who of [ADMIN, USER]) {
    const r = await apiPost(request, "/auth/register", { email: who.email, password: who.password, full_name: who.name });
    expect([201, 409]).toContain(r.status());
  }
  const sa = await apiPost(request, "/auth/login", {
    email: process.env.E2E_SUPERADMIN_EMAIL, password: process.env.E2E_SUPERADMIN_PASSWORD,
  });
  const saToken = (await sa.json()).access_token as string;
  const id = sql(`SELECT id FROM users WHERE email = '${ADMIN.email}'`).split("\n")[2]?.trim();
  const promote = await request.patch(`${API}/admin/users/${id}/role`, {
    headers: { Authorization: `Bearer ${saToken}` }, data: { role: "ADMIN" },
  });
  expect(promote.status(), await promote.text()).toBe(200);
});

test("CRUD de POIs (panel de administración)", async ({ page }) => {
  await login(page, ADMIN, /\/admin/);
  verify("POI · antes de crear", `SELECT id, name, category, is_active FROM pois WHERE name LIKE 'Ciclopuerto Ejemplo%';`);

  // CREATE
  await page.goto("/admin/estaciones");
  const map = page.locator(".leaflet-container").first();
  await expect(map).toBeVisible();
  await page.getByRole("button", { name: "Nuevo punto" }).click();
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nombre").fill(POI_NAME);
  await dialog.getByLabel("Categoría").selectOption("BIKE_PARKING");
  await dialog.getByLabel("Descripción (opcional)").fill("Estacionamiento de bicicletas de ejemplo para el informe.");
  await dialog.getByLabel("Capacidad (opcional)").fill("20");
  await shot(page, "01-poi-crear-formulario.png");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  await shot(page, "02-poi-crear-resultado.png");
  verify("POI · después de crear (INSERT)",
    `SELECT p.id, p.name, p.category, b.capacity AS capacidad, ST_AsText(p.location) AS ubicacion, p.is_active, p.created_at FROM pois p LEFT JOIN bike_stations b ON b.poi_id = p.id WHERE p.name = '${POI_NAME}';`);

  // READ (mapa público + API pública)
  await page.goto("/mapa");
  await shot(page, "03-poi-listar-mapa.png");

  // UPDATE
  await page.goto("/admin/estaciones");
  await expect(map).toBeVisible();
  await page.waitForTimeout(1200);
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nombre")).toHaveValue(POI_NAME);
  await dialog.getByLabel("Nombre").fill(POI_EDITED);
  await dialog.getByLabel("Capacidad (opcional)").fill("35");
  await shot(page, "04-poi-editar-formulario.png");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  verify("POI · después de editar (UPDATE)",
    `SELECT p.id, p.name, b.capacity AS capacidad, p.is_active, p.created_at, p.updated_at FROM pois p LEFT JOIN bike_stations b ON b.poi_id = p.id WHERE p.name LIKE 'Ciclopuerto Ejemplo%';`);

  // DELETE (borrado lógico, API_CONTRACT §7)
  await page.waitForTimeout(1200);
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar" }).click();
  await shot(page, "05-poi-eliminar-confirmacion.png");
  await dialog.getByRole("button", { name: /eliminar|confirmar/i }).last().click();
  await expect(dialog).toBeHidden();
  await shot(page, "06-poi-eliminar-resultado.png");
  verify("POI · después de eliminar (borrado lógico: is_active = false)",
    `SELECT id, name, is_active, updated_at FROM pois WHERE name LIKE 'Ciclopuerto Ejemplo%';`);
  verify("Auditoría de las operaciones sobre el POI",
    `SELECT action, entity_type, created_at FROM audit_logs WHERE entity_type = 'poi' ORDER BY created_at;`);
});

test("CRUD de viajes (usuario)", async ({ page, request }) => {
  verify("Viajes · antes de registrar",
    `SELECT count(*) AS viajes FROM trips t JOIN users u ON u.id = t.user_id WHERE u.email = '${USER.email}';`);

  // CREATE: la app Android sube el viaje completo (ADR-004); aquí se reproduce esa petición.
  const auth = await apiPost(request, "/auth/login", { email: USER.email, password: USER.password });
  const token = (await auth.json()).access_token as string;
  const base = new Date(Date.now() - 26 * 3600 * 1000);
  base.setUTCMinutes(0, 0, 0);
  const trips = [
    { mode: "BICYCLE", minutes: 18, route: [[-100.3925, 20.5931], [-100.3880, 20.5905], [-100.3812, 20.5888], [-100.3751, 20.5870]] },
    { mode: "BUS", minutes: 25, route: [[-100.4020, 20.6010], [-100.3950, 20.5960], [-100.3850, 20.5900], [-100.3700, 20.5850]] },
    { mode: "WALK", minutes: 15, route: [[-100.3899, 20.5888], [-100.3870, 20.5902], [-100.3842, 20.5921]] },
  ];
  for (const [i, t] of trips.entries()) {
    const start = new Date(base.getTime() - i * 3 * 3600 * 1000);
    const res = await request.post(`${API}/trips`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        client_trip_id: crypto.randomUUID(), mode: t.mode,
        started_at: start.toISOString(), ended_at: new Date(start.getTime() + t.minutes * 60_000).toISOString(),
        route: { type: "LineString", coordinates: t.route },
      },
    });
    expect(res.status(), await res.text()).toBe(201);
  }
  verify("Viajes · después de registrar (INSERT; distancia y CO₂ calculados en el servidor)",
    `SELECT t.id, t.mode, round(t.distance_m) AS distancia_m, t.duration_s, round(t.co2_saved_g::numeric, 1) AS co2_evitado_g, t.emission_factor_g_per_km FROM trips t JOIN users u ON u.id = t.user_id WHERE u.email = '${USER.email}' ORDER BY t.started_at DESC;`);

  // READ: listado y detalle en la web
  await login(page, USER, /\/app/);
  await page.goto("/app/viajes");
  await expect(page.getByRole("table")).toBeVisible();
  await shot(page, "07-viaje-listar.png");
  await page.getByRole("table").getByRole("link").first().click();
  await page.waitForURL(/\/app\/viajes\/[0-9a-f-]{36}/);
  await shot(page, "08-viaje-detalle.png");
  const tripId = page.url().split("/").pop()!;

  // DELETE (borrado físico de datos personales, SECURITY.md §5)
  await page.getByRole("button", { name: /eliminar/i }).first().click();
  await shot(page, "09-viaje-eliminar-confirmacion.png");
  await page.getByRole("dialog").getByRole("button", { name: /eliminar/i }).last().click();
  await page.waitForURL(/\/app\/viajes(\?|$)/);
  await shot(page, "10-viaje-eliminar-resultado.png");
  verify("Viajes · después de eliminar (DELETE)",
    `SELECT count(*) AS existe FROM trips WHERE id = '${tripId}';`);
  verify("Viajes restantes del usuario",
    `SELECT t.mode, round(t.distance_m) AS distancia_m FROM trips t JOIN users u ON u.id = t.user_id WHERE u.email = '${USER.email}' ORDER BY t.started_at DESC;`);

});
