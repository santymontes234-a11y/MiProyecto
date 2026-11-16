import { dateInputToIso, formatPercent } from "@/lib/format";
import { bboxTooLarge } from "@/lib/geo";

describe("formateadores y utilidades", () => {
  it("convierte fechas de input a ISO del contrato", () => {
    expect(dateInputToIso("2026-11-15")).toBe("2026-11-15T00:00:00Z");
    expect(dateInputToIso("2026-11-15", true)).toBe("2026-11-15T23:59:59Z");
    expect(dateInputToIso("15/11/2026")).toBeUndefined();
  });
  it("porcentajes", () => {
    expect(formatPercent(0.426)).toBe("43 %");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
  it("bbox máximo 0.5° × 0.5° (contrato §5)", () => {
    expect(bboxTooLarge([-100.5, 20.5, -100.1, 20.9])).toBe(false);
    expect(bboxTooLarge([-100.7, 20.5, -100.1, 20.9])).toBe(true);
  });
});
