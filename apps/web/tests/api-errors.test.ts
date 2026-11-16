import { ApiError } from "@ecomove/shared";
import { fieldErrorsFromApi } from "@/lib/validation/api-errors";

describe("fieldErrorsFromApi (422 del contrato)", () => {
  it("contrato 1.0.1: contraseña actual incorrecta", () => {
    const e = new ApiError(422, "VALIDATION_ERROR", "Datos inválidos", [{ loc: ["body", "current_password"], msg: "Contraseña incorrecta" }]);
    expect(fieldErrorsFromApi(e)).toEqual({ current_password: "Contraseña incorrecta" });
  });
  it("ignora otros estados y detalles mal formados", () => {
    expect(fieldErrorsFromApi(new ApiError(401, "UNAUTHORIZED", "x", [{ loc: ["body", "current_password"] }]))).toEqual({});
    expect(fieldErrorsFromApi(new ApiError(422, "VALIDATION_ERROR", "x", null))).toEqual({});
    expect(fieldErrorsFromApi(new ApiError(422, "VALIDATION_ERROR", "x", ["raro", { loc: "body" }]))).toEqual({});
    expect(fieldErrorsFromApi(new Error("x"))).toEqual({});
  });
  it("usa el último segmento de texto del loc", () => {
    const e = new ApiError(422, "VALIDATION_ERROR", "x", [{ loc: ["body", "route", "coordinates", 0], msg: "m" }]);
    expect(fieldErrorsFromApi(e)).toEqual({ coordinates: "m" });
  });
});
