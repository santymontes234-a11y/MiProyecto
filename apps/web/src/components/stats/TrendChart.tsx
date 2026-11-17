"use client";

import { useMemo, useState } from "react";
import { formatCo2, formatDistance, type Granularity, type TimeSeries, type TimeSeriesQuery } from "@ecomove/shared";
import { formatNumber, formatPeriod, daysAgoIso } from "@/lib/format";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { emptyPoint, fillSeries } from "@/lib/series";
import { Segmented } from "@/components/ui/Segmented";
import { ChartCard } from "./ChartCard";
import { TimeSeriesChart } from "./Charts";

type Metric = "trips_count" | "co2_saved_g" | "distance_m";

const METRICS: { value: Metric; label: string; format: (v: number) => string }[] = [
  { value: "trips_count", label: "Viajes", format: (v) => formatNumber(v) },
  { value: "co2_saved_g", label: "CO₂ evitado", format: formatCo2 },
  { value: "distance_m", label: "Distancia", format: formatDistance },
];

/** Rango por defecto para cada granularidad (30 días, 12 semanas, 12 meses). */
const RANGE_DAYS: Record<Granularity, number> = { day: 30, week: 84, month: 365 };

export function timeseriesQuery(granularity: Granularity, now = new Date()): TimeSeriesQuery {
  return { granularity, from: daysAgoIso(RANGE_DAYS[granularity], now), to: now.toISOString() };
}

/**
 * Viajes / CO₂ / distancia por día, semana o mes. Una métrica a la vez (un solo eje Y).
 * `load` recibe la consulta del contrato (TimeSeriesQuery).
 */
export function TrendChart({ title, description, load, cacheKey }: { title: string; description?: string; load: (q: TimeSeriesQuery) => Promise<TimeSeries>; cacheKey: string }) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [metric, setMetric] = useState<Metric>("trips_count");
  const query = useMemo(() => timeseriesQuery(granularity), [granularity]);
  const { data, error, loading, refetch } = useApiQuery(`${cacheKey}|${granularity}`, () => load(query));
  const m = METRICS.find((x) => x.value === metric)!;
  const points = useMemo(() => (data ? fillSeries(data.points, granularity, query.from, query.to, emptyPoint) : []), [data, granularity, query]);
  const chartData = points.map((p) => ({ period: p.period_start, value: p[metric] }));
  const total = points.reduce((acc, p) => acc + p[metric], 0);

  return (
    <ChartCard
      title={title}
      description={description ?? `${m.label}: ${m.format(total)} en el periodo`}
      loading={loading}
      error={error ? errorMessage(error) : null}
      onRetry={refetch}
      empty={points.length === 0 || total === 0}
      actions={
        <>
          <Segmented label="Métrica" value={metric} onChange={setMetric} options={METRICS.map(({ value, label }) => ({ value, label }))} />
          <Segmented label="Agrupar por" value={granularity} onChange={setGranularity} options={[{ value: "day", label: "Día" }, { value: "week", label: "Semana" }, { value: "month", label: "Mes" }]} />
        </>
      }
      table={{
        headers: ["Periodo", "Viajes", "CO₂ evitado", "Distancia"],
        rows: points.map((p) => [formatPeriod(p.period_start, granularity), formatNumber(p.trips_count), formatCo2(p.co2_saved_g), formatDistance(p.distance_m)]),
      }}
    >
      <TimeSeriesChart
        data={chartData}
        xKey="period"
        series={[{ key: "value", label: m.label, format: m.format }]}
        labelFormat={(l) => formatPeriod(l, granularity)}
        yFormat={(v) => (metric === "trips_count" ? formatNumber(v) : m.format(v))}
        integerY={metric === "trips_count"}
      />
    </ChartCard>
  );
}
