import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath (anti open-redirect)", () => {
  it("acepta rutas internas", () => {
    expect(safeNextPath("/app/viajes?page=2")).toBe("/app/viajes?page=2");
    expect(safeNextPath("/admin", "/app")).toBe("/admin");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/api/session/login", "/login", "/app\r\nSet-Cookie: x", ""])("rechaza %j", (v) => {
    expect(safeNextPath(v, "/app")).toBe("/app");
  });
  it("usa el fallback si falta", () => {
    expect(safeNextPath(undefined, "/admin")).toBe("/admin");
  });
});
