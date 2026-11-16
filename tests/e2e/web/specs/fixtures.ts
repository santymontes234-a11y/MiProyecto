import { test as base, expect } from "@playwright/test";
import { API } from "./helpers";

/**
 * NEXT_PUBLIC_API_BASE_URL se incrusta en el build de Next. Si la API de pruebas vive en otra URL
 * (stack aislado de tests/e2e/run-local.sh), E2E_BROWSER_API_FROM indica qué URL usa el build y
 * las llamadas del navegador se reenvían a E2E_API_BASE_URL. El reenvío conserva método, cabeceras
 * (Origin incluido) y cuerpo, así que CORS y la autenticación se evalúan en la API real.
 */
const FROM = process.env.E2E_BROWSER_API_FROM?.replace(/\/+$/, "");

export const test = base.extend({
  page: async ({ page }, use) => {
    if (FROM && FROM !== API) {
      await page.route(`${FROM}/**`, async (route) => {
        const url = route.request().url().replace(FROM, API);
        const response = await route.fetch({ url });
        await route.fulfill({ response });
      });
    }
    await use(page);
  },
});

export { expect };
