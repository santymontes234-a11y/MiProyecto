"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { AnalyticsDataset, AnalyticsMeta, AnalyticsQuery } from "@ecomove/shared";
import { Segmented } from "@/components/ui/Segmented";
import { Badge } from "@/components/ui/Badge";
import { daysAgoIso } from "@/lib/format";

/** Rangos permitidos por §13.1 (máx. 731 días). */
export type AnalyticsRange = "30d" | "90d" | "365d";

interface Ctx {
  range: AnalyticsRange;
  dataset: AnalyticsDataset;
  query: AnalyticsQuery;
  key: string;
  setRange: (r: AnalyticsRange) => void;
  setDataset: (d: AnalyticsDataset) => void;
}

const FiltersContext = createContext<Ctx | null>(null);

export function AnalyticsFiltersProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<AnalyticsRange>("90d");
  const [dataset, setDataset] = useState<AnalyticsDataset>("official");
  const value = useMemo<Ctx>(() => {
    const now = new Date();
    const query: AnalyticsQuery = { from: daysAgoIso(Number.parseInt(range, 10), now), to: now.toISOString(), dataset };
    return { range, dataset, query, key: `${range}|${dataset}`, setRange, setDataset };
  }, [range, dataset]);
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useAnalyticsFilters(): Ctx {
  const v = useContext(FiltersContext);
  if (!v) throw new Error("useAnalyticsFilters requiere AnalyticsFiltersProvider");
  return v;
}

export function AnalyticsFilterBar() {
  const { range, setRange, dataset, setDataset } = useAnalyticsFilters();
  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-3">
      <Segmented label="Periodo" value={range} onChange={setRange} options={[{ value: "30d", label: "30 días" }, { value: "90d", label: "90 días" }, { value: "365d", label: "12 meses" }]} />
      <Segmented label="Conjunto de datos" value={dataset} onChange={setDataset} options={[{ value: "official", label: "Oficial" }, { value: "demo", label: "Demo" }]} />
      {dataset === "demo" && <Badge tone="yellow">DATOS DEMO SINTÉTICOS</Badge>}
    </div>
  );
}

/** Notas de la API (k-anonimato, estimaciones, DEMO). Siempre visibles (§13.1). */
export function MetaNotes({ meta }: { meta: AnalyticsMeta | null | undefined }) {
  if (!meta) return null;
  return (
    <div className="mt-3 space-y-1 text-xs text-ink-muted">
      <p className="flex flex-wrap items-center gap-2">
        {meta.is_demo && <Badge tone="yellow">DEMO</Badge>}
        {meta.is_estimate && <span>CO₂ estimado.</span>}
        <span>Solo grupos de ≥ {meta.min_users} usuarios.</span>
      </p>
      {meta.notes.map((n) => <p key={n}>{n}</p>)}
    </div>
  );
}
