// @vitest-environment node
import type { TokenPair } from "@ecomove/shared";
import { REFRESH_COOKIE, SESSION_HINT_COOKIE, sessionResponse } from "@/lib/bff";

const pair: TokenPair = {
  access_token: "AT",
  refresh_token: "RT-secreto",
  token_type: "bearer",
  expires_in: 900,
  user: { id: "u1", email: "ana@example.com", full_name: "Ana", role: "USER", is_active: true, created_at: "2026-11-15T18:30:00Z" },
};

describe("BFF de sesión", () => {
  it("nunca devuelve el refresh token al navegador y lo guarda HttpOnly", async () => {
    const res = await sessionResponse(Response.json(pair));
    const body = await res.json();
    expect(body).toEqual({ access_token: "AT", expires_in: 900, user: pair.user });
    expect(JSON.stringify(body)).not.toContain("RT-secreto");
    const rt = res.cookies.get(REFRESH_COOKIE);
    expect(rt?.value).toBe("RT-secreto");
    expect(rt?.httpOnly).toBe(true);
    expect(rt?.path).toBe("/api/session");
    expect(rt?.sameSite).toBe("lax");
    const hint = res.cookies.get(SESSION_HINT_COOKIE);
    expect(hint?.value).toBe("1");
    expect(hint?.httpOnly).toBe(true);
  });

  it("un 401 de la API borra las cookies y conserva el error del contrato", async () => {
    const err = { error: { code: "TOKEN_INVALID", message: "Token inválido", details: null } };
    const res = await sessionResponse(Response.json(err, { status: 401 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(err);
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("");
    expect(res.cookies.get(SESSION_HINT_COOKIE)?.value).toBe("");
  });
});

describe("route handler /api/session/login", () => {
  it("rechaza peticiones de otro origen (login CSRF) sin llamar a la API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/session/login/route");
    const res = await POST(new Request("http://localhost:3000/api/session/login", { method: "POST", headers: { host: "localhost:3000", origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.mx", password: "x" }) }));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("responde 422 con formato del contrato ante JSON inválido", async () => {
    const { POST } = await import("@/app/api/session/login/route");
    const res = await POST(new Request("http://localhost:3000/api/session/login", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "x-ecomove-csrf": "1" }, body: "{no es json" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
