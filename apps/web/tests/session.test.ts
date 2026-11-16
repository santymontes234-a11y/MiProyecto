import type { User } from "@ecomove/shared";

const user: User = { id: "u1", email: "ana@example.com", full_name: "Ana López", role: "USER", is_active: true, created_at: "2026-11-15T18:30:00Z" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("sesión del navegador (ADR-003)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("login guarda el access token solo en memoria y envía la cabecera CSRF", async () => {
    const fetchMock = vi.fn(async () => json({ access_token: "AT1", expires_in: 900, user }));
    vi.stubGlobal("fetch", fetchMock);
    const s = await import("@/lib/session");
    const u = await s.login({ email: "ana@example.com", password: "bicicleta1" });
    expect(u.email).toBe("ana@example.com");
    expect(s.getAccessToken()).toBe("AT1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/session/login");
    expect((init.headers as Record<string, string>)["x-ecomove-csrf"]).toBe("1");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("propaga el código de error del contrato", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "INVALID_CREDENTIALS", message: "Credenciales inválidas", details: null } }, 401)));
    const s = await import("@/lib/session");
    await expect(s.login({ email: "a@b.mx", password: "x" })).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
    expect(s.getAccessToken()).toBeNull();
  });

  it("refresh es single-flight: nunca dos rotaciones simultáneas", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    const s = await import("@/lib/session");
    const a = s.refreshAccessToken();
    const b = s.refreshAccessToken();
    const c = s.refreshSession();
    resolve(json({ access_token: "AT2", expires_in: 900, user }));
    expect(await a).toBe("AT2");
    expect(await b).toBe("AT2");
    expect((await c)?.user.id).toBe("u1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un refresh fallido limpia la sesión", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "TOKEN_INVALID", message: "x", details: null } }, 401)));
    const s = await import("@/lib/session");
    expect(await s.refreshAccessToken()).toBeNull();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getCachedUser()).toBeNull();
  });
});
