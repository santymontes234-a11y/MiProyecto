"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { BBox, PriorityInfra, PriorityResponse } from "@ecomove/shared";
import { api } from "@/lib/api";
import { bboxTooLarge } from "@/lib/geo";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { MapView } from "@/components/map/MapView";
import { Segmented } from "@/components/ui/Segmented";
import { Alert, EmptyState } from "@/components/ui/StateViews";
import { AnalyticsFilterBar, AnalyticsFiltersProvider, MetaNotes, useAnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { BikeLaneCoverageTable } from "./BikeLaneCoverage";
import { HeatmapTable } from "./HeatmapTable";
import { HeatmapLegend, PriorityLegend } from "./Legends";
import { PriorityTable } from "./PriorityTable";
import { INFRA_LABELS } from "./ramp";

// Las capas importan react-leaflet (usa `window`): solo en el cliente.
const HeatmapLayer = dynamic(() => import("./HeatmapLayer").then((m) => m.HeatmapLayer), { ssr: false });
const PriorityLayer = dynamic(() => import("./PriorityLayer").then((m) => m.PriorityLayer), { ssr: false });

export type AnalyticsLayer = "heat" | "coverage" | "priority";
type Cell = PriorityResponse["features"][number];

/**
 * Mapa analítico del panel ADMIN (§13): calor de viajes, cobertura de ciclovías e índice de
 * prioridad por celda. Cada capa trae leyenda y tabla alternativa; los datos DEMO se marcan y
 * nunca se mezclan con los oficiales (el filtro `dataset` es excluyente).
 */
export function AnalyticsMap({ height = 500, initialLayer = "heat" }: { height?: number; initialLayer?: AnalyticsLayer }) {
  return (
    <AnalyticsFiltersProvider>
      <AnalyticsMapInner height={height} initialLayer={initialLayer} />
    </AnalyticsFiltersProvider>
  );
}

function AnalyticsMapInner({ height, initialLayer }: { height: number; initialLayer: AnalyticsLayer }) {
  const { query, key } = useAnalyticsFilters();
  const [layer, setLayer] = useState<AnalyticsLayer>(initialLayer);
  const [infra, setInfra] = useState<PriorityInfra>("bike_lane");
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const onBounds = useCallback((b: BBox) => setBbox(b), []);
  const tooLarge = !!bbox && bboxTooLarge(bbox);
  const area = bbox && !tooLarge ? bbox.join(",") : null;

  const heat = useApiQuery(layer === "heat" && area ? `heat|${key}|${area}` : null, () => api.analytics.heatmap({ ...query, bbox: bbox!, point: "both" }));
  const cycleways = useApiQuery(layer === "coverage" && area ? `cyc|${area}` : null, () => api.map.cycleways(bbox!));
  // Cobertura: indicador de toda la ciudad en el periodo (la API no recorta por bbox).
  const coverage = useApiQuery(layer === "coverage" ? `cov|${key}` : null, () => api.analytics.bikeLaneCoverage(query));
  const priority = useApiQuery(layer === "priority" && area ? `prio|${key}|${infra}|${area}` : null, () => api.analytics.infrastructurePriority({ ...query, bbox: bbox!, infra }));

  const active = layer === "heat" ? heat : layer === "coverage" ? coverage : priority;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <AnalyticsFilterBar />
        <Segmented
          label="Capa"
          value={layer}
          onChange={(v) => {
            setLayer(v);
            setSelected(null);
          }}
          options={[{ value: "heat", label: "Calor" }, { value: "coverage", label: "Ciclovías" }, { value: "priority", label: "Prioridad" }]}
        />
        {layer === "priority" && (
          <Segmented
            label="Infraestructura"
            value={infra}
            onChange={(v) => {
              setInfra(v);
              setSelected(null);
            }}
            options={(Object.keys(INFRA_LABELS) as PriorityInfra[]).map((k) => ({ value: k, label: INFRA_LABELS[k] }))}
          />
        )}
      </div>

      <div aria-live="polite" className="space-y-2">
        {tooLarge && <Alert tone="info">Acerca el mapa para calcular esta capa (área máxima 0.5° × 0.5°).</Alert>}
        {active.error && <Alert tone="error">{errorMessage(active.error)}</Alert>}
        {active.loading && <p className="text-xs text-ink-muted">Calculando…</p>}
      </div>

      <MapView label="Mapa analítico de movilidad" height={height} onBoundsChange={onBounds} cycleways={layer === "coverage" ? (cycleways.data?.features ?? []) : []}>
        {layer === "heat" && heat.data && <HeatmapLayer data={heat.data} />}
        {layer === "priority" && priority.data && <PriorityLayer data={priority.data} onSelect={setSelected} />}
      </MapView>

      {layer === "heat" && heat.data && (
        heat.data.features.length === 0 ? (
          <EmptyState title="Sin celdas con datos suficientes" description="Se ocultan las celdas con menos personas que el mínimo de privacidad. Amplía el periodo o el área." />
        ) : (
          <>
            <HeatmapLegend cellM={heat.data.cell_m} maxWeight={heat.data.max_weight} />
            <HeatmapTable data={heat.data} />
          </>
        )
      )}

      {layer === "coverage" && coverage.data && (
        <>
          <p className="text-xs text-ink-muted">Ciclovías del área visible: línea continua = protegida, punteada = no protegida (© OpenStreetMap contributors).</p>
          {coverage.data.items.length === 0 ? (
            <EmptyState title="Sin viajes suficientes en el área" description="No hay grupos que cumplan el mínimo de personas para calcular la cobertura." />
          ) : (
            <BikeLaneCoverageTable data={coverage.data} />
          )}
        </>
      )}

      {layer === "priority" && priority.data && (
        <>
          <p className="text-sm">
            <span className="font-semibold">{priority.data.profile_label}.</span>{" "}
            <span className="text-ink-muted">Índice orientativo para priorizar estudios, no una medición de necesidad. Configuración {priority.data.config_version}.</span>
          </p>
          {priority.data.features.length === 0 ? (
            <EmptyState title="Sin celdas en el área" description="Mueve o amplía el mapa." />
          ) : (
            <>
              <PriorityLegend data={priority.data} />
              <PriorityTable data={priority.data} selected={selected} />
            </>
          )}
          {priority.data.notes.map((n) => <p key={n} className="text-xs text-ink-muted">{n}</p>)}
        </>
      )}

      <MetaNotes meta={active.data?.meta} />
    </div>
  );
}
