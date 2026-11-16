// @vitest-environment node
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function run(path: string, cookie?: string) {
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }));
}

describe("proxy de rutas privadas", () => {
  it("redirige a /login conservando el destino", () => {
    const res = run("/admin/usuarios?page=2");
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/admin/usuarios?page=2");
  });
  it("deja pasar con la cookie indicadora", () => {
    expect(run("/app", "ecomove_sess=1").headers.get("location")).toBeNull();
  });
  it("lleva a /app si ya hay sesión y se abre /login", () => {
    expect(new URL(run("/login", "ecomove_sess=1").headers.get("location")!).pathname).toBe("/app");
  });
  it("no rebota a /app cuando la sesión expiró (evita bucles)", () => {
    expect(run("/login?expired=1", "ecomove_sess=1").headers.get("location")).toBeNull();
  });
});
