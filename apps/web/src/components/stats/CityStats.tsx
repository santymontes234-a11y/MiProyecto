"use client";

import { useMemo, useState } from "react";
import { Bike, Leaf, MapPinned, Timer } from "lucide-react";
import { formatCo2, formatDistance, formatDuration } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { StatTile } from "@/components/ui/StatTile";
import { Alert } from "@/components/ui/StateViews";
import { Co2ByModeChart, ModeShareChart } from "./ModeShareChart";
import { RangePicker, rangeQuery, type RangeKey } from "./RangePicker";

export function CityStats() {
  const [range, setRange] = useState<RangeKey>("365d");
  const query = useMemo(() => rangeQuery(range), [range]);
  const { data, error, loading, refetch } = useApiQuery(`city|${range}`, () => api.stats.city(query));
  const empty = !!data && data.trips_count === 0;
  const v = (fn: () => string) => (loading || !data || empty ? "—" : fn());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker value={range} onChange={setRange} />
        {data && <p className="text-xs text-ink-muted">Datos agregados y anónimos.</p>}
      </div>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {empty && <Alert tone="info">En este periodo todavía no hay suficientes viajes para publicar cifras sin comprometer la privacidad.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Viajes" value={v(() => formatNumber(data!.trips_count))} icon={<Bike className="size-5" />} />
        <StatTile label="CO₂ evitado" value={v(() => formatCo2(data!.co2_saved_g))} icon={<Leaf className="size-5" />} />
        <StatTile label="Distancia" value={v(() => formatDistance(data!.distance_m))} icon={<MapPinned className="size-5" />} accent="blue" />
        <StatTile label="Tiempo en movimiento" value={v(() => formatDuration(data!.duration_s))} icon={<Timer className="size-5" />} accent="teal" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ModeShareChart data={empty ? [] : data?.by_mode} loading={loading} error={error ? errorMessage(error) : null} onRetry={refetch} />
        <Co2ByModeChart data={empty ? [] : data?.by_mode} loading={loading} error={error ? errorMessage(error) : null} onRetry={refetch} />
      </div>
    </div>
  );
}
