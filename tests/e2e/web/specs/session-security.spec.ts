import { expect, test } from "./fixtures";
import { createUser, expectNoTokensInBrowserStorage, loginViaUi, TEST_PASSWORD, uniqueEmail } from "./helpers";

test.describe("Páginas públicas y cabeceras", () => {
  test("la portada carga con CSP y cabeceras de seguridad", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    const h = res!.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("rutas privadas sin sesión redirigen a /login con next", async ({ page }) => {
    for (const path of ["/app", "/app/viajes", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/\//g, "%2F")}`));
    }
  });
});

test.describe("Registro, sesión y logout", () => {
  test("registro por UI → /app, cookies seguras y sin tokens accesibles por JS", async ({ page, context }) => {
    const email = uniqueEmail();
    await page.goto("/registro");
    await page.getByLabel("Nombre completo").fill("Ana Web QA");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel("Confirma tu contraseña").fill(TEST_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/app(\?|$)/);

    const cookies = await context.cookies();
    const rt = cookies.find((c) => c.name === "ecomove_rt");
    expect(rt, "falta la cookie del refresh token").toBeDefined();
    expect(rt!.httpOnly).toBe(true);
    expect(rt!.sameSite).toBe("Lax");
    expect(rt!.path).toBe("/api/session");
    // ADR-003: el único JWT en cookie es el refresh (HttpOnly); el access token vive solo en memoria.
    for (const c of cookies.filter((c) => c.name !== "ecomove_rt")) {
      expect(c.value, `JWT en cookie ${c.name}`).not.toMatch(/^eyJ/);
    }
    await expectNoTokensInBrowserStorage(page);

    // La sesión sobrevive a una recarga (refresh vía cookie HttpOnly).
    await page.reload();
    await expect(page).toHaveURL(/\/app/);
    await expectNoTokensInBrowserStorage(page);

    // Logout: limpia la sesión y vuelve a proteger /app.
    await page.getByRole("button", { name: /cerrar sesión/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    expect((await context.cookies()).find((c) => c.name === "ecomove_rt" && c.value)).toBeUndefined();
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login con credenciales inválidas muestra un error genérico", async ({ page, request }) => {
    const { email } = await createUser(request);
    // Se excluye el anunciador de rutas de Next (role="alert" vacío).
    const errorAlert = () => page.getByRole("alert").filter({ hasText: /\S/ }).first();
    await loginViaUi(page, email, "Incorrecta-123");
    await expect(errorAlert()).toBeVisible();
    const wrong = (await errorAlert().textContent()) ?? "";
    await loginViaUi(page, uniqueEmail(), "Incorrecta-123");
    await expect(errorAlert()).toBeVisible();
    const unknown = (await errorAlert().textContent()) ?? "";
    expect(wrong.length).toBeGreaterThan(0);
    expect(wrong).toBe(unknown); // sin enumeración de usuarios
    await expect(page).toHaveURL(/\/login/);
  });

  test("next= externo no produce open redirect", async ({ page, request, baseURL }) => {
    const { email, password } = await createUser(request);
    for (const next of ["https://evil.example/robo", "//evil.example/robo", "/\\evil.example"]) {
      await loginViaUi(page, email, password, next);
      await page.waitForURL((u) => !u.pathname.startsWith("/login"));
      expect(new URL(page.url()).host).toBe(new URL(baseURL!).host);
      expect(page.url()).not.toContain("evil.example");
      await page.context().clearCookies();
    }
  });
});

test.describe("CSRF del BFF de sesión", () => {
  test("POST /api/session/* sin cabecera CSRF o con Origin ajeno → 403", async ({ page, baseURL }) => {
    await page.goto("/");
    const body = { email: uniqueEmail(), password: TEST_PASSWORD };
    const noHeader = await page.request.post("/api/session/login", { data: body, headers: { origin: baseURL! } });
    expect(noHeader.status()).toBe(403);
    const foreign = await page.request.post("/api/session/login", {
      data: body,
      headers: { origin: "https://evil.example", "x-ecomove-csrf": "1" },
    });
    expect(foreign.status()).toBe(403);
    const json = await foreign.json();
    expect(json.error.code).toBe("FORBIDDEN"); // formato de error del contrato
  });

  test("JSON inválido en el BFF → 422, nunca 500", async ({ page, baseURL }) => {
    await page.goto("/");
    const res = await page.request.post("/api/session/login", {
      data: "{no-json",
      headers: { origin: baseURL!, "x-ecomove-csrf": "1", "content-type": "application/json" },
    });
    expect(res.status()).toBe(422);
  });
});

test.describe("Autorización y XSS en UI", () => {
  test("un USER no ve el panel admin", async ({ page, request }) => {
    const { email, password } = await createUser(request);
    await loginViaUi(page, email, password);
    await page.waitForURL(/\/app/);
    // Cualquier respuesta de /admin/* de la API para este token debe ser 403.
    const adminCalls: number[] = [];
    page.on("response", (r) => {
      if (/\/api\/v1\/admin\//.test(r.url())) adminCalls.push(r.status());
    });
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/app\?forbidden=1/);
    // Solo puede aparecer su propio email (barra lateral), nunca un listado de otros usuarios.
    await expect(page.getByText(/@example\.com/).filter({ hasNotText: email })).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    expect(adminCalls.every((s) => s === 403 || s === 401), `respuestas /admin: ${adminCalls}`).toBe(true);
  });

  test("un nombre con HTML se muestra como texto, no se ejecuta", async ({ page, request }) => {
    const payload = `<img src=x onerror="window.__xss=1">QA`;
    const { email, password } = await createUser(request, payload);
    await loginViaUi(page, email, password);
    await page.waitForURL(/\/app/);
    for (const path of ["/app", "/app/perfil"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
      expect(await page.locator('img[src="x"]').count()).toBe(0);
    }
  });
});
