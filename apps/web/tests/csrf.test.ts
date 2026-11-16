import { CSRF_HEADER, isSameOriginRequest } from "@/lib/auth/csrf";

function req(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/session/login", { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("acepta mismo origen con la cabecera propia", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3000", origin: "http://localhost:3000", [CSRF_HEADER]: "1" }))).toBe(true);
  });
  it("rechaza sin cabecera CSRF", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(false);
  });
  it("rechaza otro origen", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3000", origin: "https://evil.example", [CSRF_HEADER]: "1" }))).toBe(false);
  });
  it("rechaza sin Origin o con Origin inválido", () => {
    expect(isSameOriginRequest(req({ host: "localhost:3000", [CSRF_HEADER]: "1" }))).toBe(false);
    expect(isSameOriginRequest(req({ host: "localhost:3000", origin: "null", [CSRF_HEADER]: "1" }))).toBe(false);
  });
});
