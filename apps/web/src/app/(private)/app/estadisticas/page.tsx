"use client";

import { useMemo, useState } from "react";
import { Bike, Leaf, MapPinned, Wind } from "lucide-react";
import { formatCo2, formatDistance } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Alert } from "@/components/ui/StateViews";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { RangePicker, rangeQuery, type RangeKey } from "@/components/stats/RangePicker";
import { TrendChart } from "@/components/stats/TrendChart";
import { Co2ByModeChart, ModeShareChart } from "@/components/stats/ModeShareChart";

export default function MyStatsPage() {
  const [range, setRange] = useState<RangeKey>("90d");
  const query = useMemo(() => rangeQuery(range), [range]);
  const { data, error, loading, refetch } = useApiQuery(`me|${range}`, () => api.stats.me(query));
  const v = (fn: () => string) => (loading || !data ? "—" : fn());
  const err = error ? errorMessage(error) : null;

  return (
    <>
      <PageHeader title="Estadísticas de CO₂" description="Emisiones evitadas frente a hacer los mismos trayectos en automóvil." actions={<ExportButtons />} />
      <div className="no-print mb-6"><RangePicker value={range} onChange={setRange} /></div>
      {err && <div className="mb-6"><Alert tone="error">{err}</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="CO₂ evitado" value={v(() => formatCo2(data!.co2_saved_g))} icon={<Leaf className="size-5" />} />
        <StatTile label="CO₂ emitido" value={v(() => formatCo2(data!.co2_emitted_g))} hint="Por medios que sí emiten" icon={<Wind className="size-5" />} accent="yellow" />
        <StatTile label="Viajes" value={v(() => formatNumber(data!.trips_count))} icon={<Bike className="size-5" />} accent="blue" />
        <StatTile label="Distancia" value={v(() => formatDistance(data!.distance_m))} icon={<MapPinned className="size-5" />} accent="teal" />
      </div>
      <div className="mt-6">
        <TrendChart title="Evolución" cacheKey="me-ts-stats" load={(q) => api.stats.meTimeseries(q)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Co2ByModeChart data={data?.by_mode} loading={loading} error={err} onRetry={refetch} />
        <ModeShareChart data={data?.by_mode} loading={loading} error={err} onRetry={refetch} />
      </div>
    </>
  );
}
