import { fetchAllPages, sanitizeCell, toCsv } from "@/lib/export";

describe("CSV", () => {
  it("neutraliza fórmulas (CSV injection)", () => {
    expect(sanitizeCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(sanitizeCell("+1")).toBe("'+1");
    expect(sanitizeCell("@cmd")).toBe("'@cmd");
  });
  it("no altera números negativos ni nulos", () => {
    expect(sanitizeCell(-5)).toBe("-5");
    expect(sanitizeCell(null)).toBe("");
  });
  it("escapa comas, comillas y saltos de línea", () => {
    expect(sanitizeCell('Ana, "la" ciclista')).toBe('"Ana, ""la"" ciclista"');
    expect(sanitizeCell("a\nb")).toBe('"a\nb"');
  });
  it("genera CSV con BOM y CRLF", () => {
    const csv = toCsv(["medio", "co2_g"], [["Bicicleta", 806.4], ["Caminar", 0]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["medio,co2_g", "Bicicleta,806.4", "Caminar,0"]);
  });
});

describe("fetchAllPages", () => {
  it("recorre todas las páginas con page_size ≤ 100", async () => {
    const data = Array.from({ length: 250 }, (_, i) => i);
    const load = vi.fn(async (page: number, size: number) => ({ items: data.slice((page - 1) * size, page * size), total: data.length }));
    const all = await fetchAllPages(load);
    expect(all).toHaveLength(250);
    expect(load).toHaveBeenCalledTimes(3);
    expect(load.mock.calls.every(([, size]) => size <= 100)).toBe(true);
  });
  it("respeta maxItems", async () => {
    const load = vi.fn(async () => ({ items: Array.from({ length: 100 }, (_, i) => i), total: 10_000 }));
    expect(await fetchAllPages(load, { maxItems: 150 })).toHaveLength(150);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
