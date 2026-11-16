import { changePasswordSchema, emissionFactorSchema, loginSchema, poiFormSchema, registerFormSchema, registerRequestSchema } from "@/lib/validation/schemas";

describe("esquemas de formulario", () => {
  it("política de contraseña de SECURITY.md (≥8, letra y número)", () => {
    const ok = { full_name: "Ana López", email: "ANA@example.com ", password: "bicicleta1", confirm_password: "bicicleta1", accept_privacy: true };
    const parsed = registerFormSchema.parse(ok);
    expect(parsed.email).toBe("ana@example.com");
    expect(registerFormSchema.safeParse({ ...ok, password: "corta1", confirm_password: "corta1" }).success).toBe(false);
    expect(registerFormSchema.safeParse({ ...ok, password: "solamenteletras", confirm_password: "solamenteletras" }).success).toBe(false);
    expect(registerFormSchema.safeParse({ ...ok, password: "1234567890", confirm_password: "1234567890" }).success).toBe(false);
  });
  it("exige confirmación y aviso de privacidad", () => {
    const base = { full_name: "Ana López", email: "ana@example.com", password: "bicicleta1", confirm_password: "otra12345", accept_privacy: false };
    const r = registerFormSchema.safeParse(base);
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["accept_privacy", "confirm_password"]));
  });
  it("el cuerpo de registro del BFF es exactamente RegisterRequest", () => {
    expect(registerRequestSchema.safeParse({ email: "a@b.mx", password: "abcdefg1", full_name: "Ana", role: "ADMIN" }).success).toBe(false);
  });
  it("login no valida la política (solo formato)", () => {
    expect(loginSchema.safeParse({ email: "a@b.mx", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "no-es-correo", password: "x" }).success).toBe(false);
  });
  it("cambio de contraseña: distinta a la actual", () => {
    expect(changePasswordSchema.safeParse({ current_password: "bicicleta1", new_password: "bicicleta1", confirm_password: "bicicleta1" }).success).toBe(false);
  });
  it("POI y factor de emisión", () => {
    expect(poiFormSchema.safeParse({ name: "Ciclopuerto", category: "BIKE_PARKING", lat: "20.59", lng: "-100.39", capacity: "", is_active: true }).success).toBe(true);
    expect(poiFormSchema.safeParse({ name: "X", category: "OTRA", lat: 200, lng: 0, is_active: true }).success).toBe(false);
    expect(emissionFactorSchema.safeParse({ grams_per_km: -1 }).success).toBe(false);
    expect(emissionFactorSchema.parse({ grams_per_km: "192" }).grams_per_km).toBe(192);
  });
});
