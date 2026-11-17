import { bucketStart, emptyPoint, fillSeries } from "@/lib/series";
import { formatPeriod } from "@/lib/format";

describe("series temporales (contrato 1.1: cortes en America/Mexico_City)", () => {
  it("cubetas locales expresadas en UTC (semana desde lunes)", () => {
    expect(bucketStart(new Date("2026-11-15T14:00:00Z"), "day").toISOString()).toBe("2026-11-15T06:00:00.000Z");
    expect(bucketStart(new Date("2026-11-16T03:00:00Z"), "day").toISOString()).toBe("2026-11-15T06:00:00.000Z");
    expect(bucketStart(new Date("2026-11-15T14:00:00Z"), "week").toISOString()).toBe("2026-11-09T06:00:00.000Z");
    expect(bucketStart(new Date("2026-11-15T14:00:00Z"), "month").toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });
  it("rellena huecos con ceros sin tocar los valores de la API", () => {
    const api = [{ period_start: "2026-11-15T06:00:00Z", trips_count: 2, distance_m: 4757, co2_saved_g: 751.7 }];
    const out = fillSeries(api, "day", "2026-11-13T06:00:00Z", "2026-11-16T10:00:00Z", emptyPoint);
    expect(out.map((p) => p.period_start)).toEqual(["2026-11-13T06:00:00Z", "2026-11-14T06:00:00Z", "2026-11-15T06:00:00Z", "2026-11-16T06:00:00Z"]);
    expect(out[2]).toBe(api[0]);
    expect(out[0]!.trips_count).toBe(0);
  });
  it("el periodo se etiqueta en hora de Querétaro", () => {
    expect(formatPeriod("2026-11-15T06:00:00Z", "day")).toMatch(/^15/);
  });
});
