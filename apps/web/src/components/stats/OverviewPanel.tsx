"use client";

import { useMemo, useState } from "react";
import { Activity, Bike, Leaf, MapPinned, Users } from "lucide-react";
import { MODE_LABELS, formatCo2, formatDistance } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format";
import { timestampedName } from "@/lib/export";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { StatTile } from "@/components/ui/StatTile";
import { Alert } from "@/components/ui/StateViews";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Co2ByModeChart, ModeShareChart } from "./ModeShareChart";
import { RangePicker, rangeQuery, type RangeKey } from "./RangePicker";

/** Resumen global (GET /admin/stats/overview) con selector de periodo y exportación. */
export function OverviewPanel() {
  const [range, setRange] = useState<RangeKey>("30d");
  const query = useMemo(() => rangeQuery(range), [range]);
  const { data, error, loading, refetch } = useApiQuery(`overview|${range}`, () => api.admin.overview(query));
  const v = (fn: () => string) => (loading || !data ? "—" : fn());
  const err = error ? errorMessage(error) : null;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <RangePicker value={range} onChange={setRange} />
        <ExportButtons
          getCsv={async () => {
            const d = data ?? (await api.admin.overview(query));
            return {
              filename: timestampedName(`ecomove-resumen-${range}`, "csv"),
              headers: ["medio", "viajes", "distancia_m", "co2_evitado_g"],
              rows: d.by_mode.map((m) => [MODE_LABELS[m.mode], m.trips_count, m.distance_m, m.co2_saved_g]),
            };
          }}
        />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Usuarios" value={v(() => formatNumber(data!.users_total))} icon={<Users className="size-5" />} accent="blue" />
        <StatTile label="Activos 30 días" value={v(() => formatNumber(data!.users_active_30d))} hint={data && data.users_total > 0 ? `${formatPercent(data.users_active_30d / data.users_total)} del total` : undefined} icon={<Activity className="size-5" />} accent="teal" />
        <StatTile label="Viajes" value={v(() => formatNumber(data!.trips_total))} icon={<Bike className="size-5" />} />
        <StatTile label="CO₂ evitado" value={v(() => formatCo2(data!.co2_saved_g))} icon={<Leaf className="size-5" />} />
        <StatTile label="Distancia" value={v(() => formatDistance(data!.distance_m))} icon={<MapPinned className="size-5" />} accent="yellow" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ModeShareChart data={data?.by_mode} loading={loading} error={err} onRetry={refetch} />
        <Co2ByModeChart data={data?.by_mode} loading={loading} error={err} onRetry={refetch} />
      </div>
    </div>
  );
}
