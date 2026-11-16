"use client";

import { MODE_LABELS, formatCo2, formatDistance, type ModeBreakdown } from "@ecomove/shared";
import { formatNumber } from "@/lib/format";
import { ChartCard } from "./ChartCard";
import { BarChartView, DonutChart } from "./Charts";
import { modeColor } from "./chart-colors";

/** Viajes por medio de transporte (barras horizontales coloreadas por modo + tabla). */
export function ModeShareChart({ data, title = "Medios de transporte más usados", description, loading, error, onRetry }: {
  data: ModeBreakdown[] | null | undefined;
  title?: string;
  description?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const rows = [...(data ?? [])].sort((a, b) => b.trips_count - a.trips_count);
  const chartData = rows.map((r) => ({ mode: r.mode, label: MODE_LABELS[r.mode], trips: r.trips_count }));
  return (
    <ChartCard
      title={title}
      description={description}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0 || rows.every((r) => r.trips_count === 0)}
      height={Math.max(180, rows.length * 44)}
      table={{
        headers: ["Medio", "Viajes", "Distancia", "CO₂ evitado"],
        rows: rows.map((r) => [MODE_LABELS[r.mode], formatNumber(r.trips_count), formatDistance(r.distance_m), formatCo2(r.co2_saved_g)]),
      }}
    >
      <BarChartView
        data={chartData}
        xKey="label"
        horizontal
        series={{ key: "trips", label: "Viajes", format: (v) => formatNumber(v) }}
        colorFor={(d) => modeColor(chartData.find((c) => c.label === d.label)?.mode ?? "CAR")}
      />
    </ChartCard>
  );
}

/** CO₂ evitado por medio (dona + tabla). */
export function Co2ByModeChart({ data, loading, error, onRetry }: { data: ModeBreakdown[] | null | undefined; loading?: boolean; error?: string | null; onRetry?: () => void }) {
  const rows = (data ?? []).filter((r) => r.co2_saved_g > 0).sort((a, b) => b.co2_saved_g - a.co2_saved_g);
  const chartData = rows.map((r) => ({ mode: r.mode, label: MODE_LABELS[r.mode], co2: r.co2_saved_g }));
  return (
    <ChartCard
      title="CO₂ evitado por medio"
      description="Frente a hacer el mismo trayecto en automóvil"
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      table={{ headers: ["Medio", "CO₂ evitado"], rows: rows.map((r) => [MODE_LABELS[r.mode], formatCo2(r.co2_saved_g)]) }}
    >
      <DonutLazy data={chartData} />
    </ChartCard>
  );
}

function DonutLazy({ data }: { data: { mode: ModeBreakdown["mode"]; label: string; co2: number }[] }) {
  return <DonutChart data={data} nameKey="label" valueKey="co2" format={formatCo2} colorFor={(_, i) => modeColor(data[i]!.mode)} />;
}
