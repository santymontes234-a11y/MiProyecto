"use client";

import { useMemo, useState } from "react";
import { MODE_LABELS, POI_CATEGORIES, POI_CATEGORY_LABELS, formatCo2, formatDistance, type AnalyticsMeta, type Granularity } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatNumber, formatPercent, formatPeriod, daysAgoIso } from "@/lib/format";
import { WEEKDAY_LABELS } from "@/lib/labels";
import { fillSeries } from "@/lib/series";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { ChartCard } from "@/components/stats/ChartCard";
import { BarChartView, TimeSeriesChart } from "@/components/stats/Charts";
import { modeColor } from "@/components/stats/chart-colors";
import { Segmented } from "@/components/ui/Segmented";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Alert, EmptyState } from "@/components/ui/StateViews";
import { MetaNotes, useAnalyticsFilters } from "./AnalyticsFilters";

const SUPPRESSED = "Datos insuficientes para publicar sin comprometer la privacidad (k-anonimato).";

function Suppressed() {
  return <EmptyState title="Datos insuficientes" description={SUPPRESSED} />;
}

const GRAN_DAYS: Record<Granularity, number> = { day: 30, week: 84, month: 365 };

/** Viajes / CO₂ / usuarios activos de la ciudad por día, semana o mes (§13.2 timeseries). */
export function CityTrendCard() {
  const { query, key } = useAnalyticsFilters();
  const [g, setG] = useState<Granularity>("week");
  const [metric, setMetric] = useState<"trips_count" | "co2_saved_g" | "active_users">("trips_count");
  const q = useMemo(() => ({ ...query, from: g === "day" ? daysAgoIso(GRAN_DAYS.day) : query.from, granularity: g }), [query, g]);
  const ts = useApiQuery(`a-ts|${key}|${g}`, () => api.analytics.timeseries(q));
  const points = useMemo(
    () => (ts.data && q.from && q.to ? fillSeries(ts.data.points, g, q.from, q.to, (period_start) => ({ period_start, trips_count: 0, distance_m: 0, co2_saved_g: 0, active_users: 0 })) : []),
    [ts.data, g, q],
  );
  const fmt = metric === "co2_saved_g" ? formatCo2 : (v: number) => formatNumber(v);
  const label = { trips_count: "Viajes", co2_saved_g: "CO₂ evitado", active_users: "Usuarios activos" }[metric];
  return (
    <ChartCard
      title="Viajes por día, semana y mes"
      description={`${label} de toda la ciudad`}
      loading={ts.loading}
      error={ts.error ? errorMessage(ts.error) : null}
      onRetry={ts.refetch}
      empty={!ts.data?.suppressed && points.every((p) => p[metric] === 0)}
      actions={
        <>
          <Segmented label="Métrica" value={metric} onChange={setMetric} options={[{ value: "trips_count", label: "Viajes" }, { value: "co2_saved_g", label: "CO₂" }, { value: "active_users", label: "Usuarios" }]} />
          <Segmented label="Agrupar por" value={g} onChange={setG} options={[{ value: "day", label: "Día" }, { value: "week", label: "Semana" }, { value: "month", label: "Mes" }]} />
        </>
      }
      table={{ headers: ["Periodo", "Viajes", "CO₂ evitado", "Distancia", "Usuarios activos"], rows: points.map((p) => [formatPeriod(p.period_start, g), formatNumber(p.trips_count), formatCo2(p.co2_saved_g), formatDistance(p.distance_m), formatNumber(p.active_users)]) }}
      footer={<MetaNotes meta={ts.data?.meta} />}
    >
      {ts.data?.suppressed ? <Suppressed /> : <TimeSeriesChart data={points.map((p) => ({ period: p.period_start, value: p[metric] }))} xKey="period" series={[{ key: "value", label, format: fmt }]} labelFormat={(l) => formatPeriod(l, g)} yFormat={fmt} integerY={metric !== "co2_saved_g"} />}
    </ChartCard>
  );
}

/** Horarios pico (§13.2 peak-hours). Suma por hora; vista por día de la semana en la tabla. */
export function PeakHoursCard() {
  const { query, key } = useAnalyticsFilters();
  const ph = useApiQuery(`a-ph|${key}`, () => api.analytics.peakHours({ ...query, by_weekday: true }));
  const byHour = useMemo(() => {
    const acc = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, "0")}:00`, trips: 0 }));
    for (const it of ph.data?.items ?? []) acc[it.hour]!.trips += it.trips_count;
    return acc;
  }, [ph.data]);
  const grid = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of ph.data?.items ?? []) if (it.weekday !== null) m.set(`${it.weekday}-${it.hour}`, it.trips_count);
    return m;
  }, [ph.data]);
  return (
    <ChartCard
      title="Horarios pico"
      description={ph.data ? `Viajes por hora de inicio (${ph.data.timezone})` : undefined}
      loading={ph.loading}
      error={ph.error ? errorMessage(ph.error) : null}
      onRetry={ph.refetch}
      empty={!ph.data?.suppressed && byHour.every((h) => h.trips === 0)}
      table={{ headers: ["Día", ...Array.from({ length: 24 }, (_, h) => `${h}h`)], rows: WEEKDAY_LABELS.map((d, wd) => [d, ...Array.from({ length: 24 }, (_, h) => grid.get(`${wd}-${h}`) ?? 0)]) }}
      footer={<MetaNotes meta={ph.data?.meta} />}
    >
      {ph.data?.suppressed ? <Suppressed /> : <BarChartView data={byHour} xKey="label" series={{ key: "trips", label: "Viajes", format: (v) => formatNumber(v) }} />}
    </ChartCard>
  );
}

/** Medios de transporte más usados y CO₂ por medio (§13.2 modes). */
export function ModesCard() {
  const { query, key } = useAnalyticsFilters();
  const m = useApiQuery(`a-modes|${key}`, () => api.analytics.modes(query));
  const items = [...(m.data?.items ?? [])].sort((a, b) => b.trips_count - a.trips_count);
  return (
    <ChartCard
      title="Medios de transporte más usados"
      loading={m.loading}
      error={m.error ? errorMessage(m.error) : null}
      onRetry={m.refetch}
      empty={items.length === 0}
      height={Math.max(180, items.length * 44)}
      table={{ headers: ["Medio", "Viajes", "Participación", "Usuarios", "pasajero-km", "CO₂ evitado"], rows: items.map((i) => [MODE_LABELS[i.mode], formatNumber(i.trips_count), formatPercent(i.share_of_trips), formatNumber(i.users), formatNumber(Math.round(i.passenger_km)), formatCo2(i.avoided_g)]) }}
      footer={<MetaNotes meta={m.data?.meta} />}
    >
      <BarChartView data={items.map((i) => ({ mode: i.mode, label: MODE_LABELS[i.mode], trips: i.trips_count }))} xKey="label" horizontal series={{ key: "trips", label: "Viajes", format: (v) => formatNumber(v) }} colorFor={(d) => modeColor(items.find((i) => MODE_LABELS[i.mode] === d.label)?.mode ?? "CAR")} />
    </ChartCard>
  );
}

/** Distribución por zona (§13.2 zones): top 10 por extremos de viaje. */
export function ZonesCard() {
  const { query, key } = useAnalyticsFilters();
  const z = useApiQuery(`a-zones|${key}`, () => api.analytics.zones(query));
  const rows = useMemo(
    () => [...(z.data?.features ?? [])].map((f) => f.properties).sort((a, b) => b.origins + b.destinations - (a.origins + a.destinations)),
    [z.data],
  );
  const top = rows.slice(0, 10);
  return (
    <ChartCard
      title="Distribución por zona"
      description="Orígenes + destinos (top 10)"
      loading={z.loading}
      error={z.error ? errorMessage(z.error) : null}
      onRetry={z.refetch}
      empty={rows.length === 0}
      height={Math.max(200, top.length * 36)}
      table={{ headers: ["Zona", "Orígenes", "Destinos", "Internos", "Usuarios", "CO₂ evitado", "Extremos/km²"], rows: rows.map((r) => [r.zone_name, formatNumber(r.origins), formatNumber(r.destinations), formatNumber(r.internal_trips), formatNumber(r.users), formatCo2(r.co2_saved_g), formatNumber(Math.round(r.trip_ends_per_km2))]) }}
      footer={<MetaNotes meta={z.data?.meta} />}
    >
      <BarChartView data={top.map((r) => ({ label: r.zone_name, ends: r.origins + r.destinations }))} xKey="label" horizontal series={{ key: "ends", label: "Orígenes + destinos", format: (v) => formatNumber(v) }} />
    </ChartCard>
  );
}

interface RouteRow {
  id: string;
  origin: string;
  destination: string;
  trips: number;
  users: number;
  avg: number;
}

const routeColumns: Column<RouteRow>[] = [
  { key: "od", header: "Ruta", cell: (r) => <span>{r.origin} <span aria-hidden="true">→</span><span className="sr-only">a</span> {r.destination}</span> },
  { key: "trips", header: "Viajes", align: "right", cell: (r) => formatNumber(r.trips) },
  { key: "users", header: "Usuarios", align: "right", cell: (r) => formatNumber(r.users) },
  { key: "avg", header: "Distancia media", align: "right", cell: (r) => formatDistance(r.avg) },
];

/** Rutas frecuentes = flujos origen–destino entre zonas (§13.2 od-flows). */
export function FrequentRoutesCard() {
  const { query, key } = useAnalyticsFilters();
  const od = useApiQuery(`a-od|${key}`, () => api.analytics.odFlows({ ...query, limit: 20 }));
  const rows: RouteRow[] = (od.data?.features ?? []).map((f, i) => ({ id: f.id ?? String(i), origin: f.properties.origin_zone_name, destination: f.properties.destination_zone_name, trips: f.properties.trips_count, users: f.properties.users, avg: f.properties.avg_distance_m })).sort((a, b) => b.trips - a.trips);
  return (
    <Card>
      <CardHeader title="Rutas frecuentes" description="Flujos entre zonas con más viajes" />
      <DataTable caption="Rutas frecuentes" columns={routeColumns} rows={rows} rowKey={(r) => r.id} loading={od.loading} error={od.error ? errorMessage(od.error) : null} onRetry={od.refetch} emptyTitle="Datos insuficientes" emptyDescription={SUPPRESSED} />
      <MetaNotes meta={od.data?.meta} />
    </Card>
  );
}

/** Evolución de usuarios (§13.2 users-growth). Una métrica a la vez (un solo eje). */
export function UsersGrowthCard() {
  const { query, key } = useAnalyticsFilters();
  const [metric, setMetric] = useState<"total_users" | "new_users" | "active_users">("total_users");
  const ug = useApiQuery(`a-ug|${key}`, () => api.analytics.usersGrowth({ ...query, granularity: "month" }));
  const pts = ug.data?.points ?? [];
  const label = { total_users: "Usuarios totales", new_users: "Altas", active_users: "Usuarios activos" }[metric];
  return (
    <ChartCard
      title="Evolución de usuarios"
      description={label}
      loading={ug.loading}
      error={ug.error ? errorMessage(ug.error) : null}
      onRetry={ug.refetch}
      empty={pts.length === 0}
      actions={<Segmented label="Métrica" value={metric} onChange={setMetric} options={[{ value: "total_users", label: "Total" }, { value: "new_users", label: "Altas" }, { value: "active_users", label: "Activos" }]} />}
      table={{ headers: ["Mes", "Altas", "Total", "Activos"], rows: pts.map((p) => [formatPeriod(p.period_start, "month"), formatNumber(p.new_users), formatNumber(p.total_users), formatNumber(p.active_users)]) }}
      footer={<MetaNotes meta={ug.data?.meta} />}
    >
      <TimeSeriesChart data={pts.map((p) => ({ period: p.period_start, value: p[metric] }))} xKey="period" series={[{ key: "value", label, format: (v) => formatNumber(v) }]} labelFormat={(l) => formatPeriod(l, "month")} yFormat={(v) => formatNumber(v)} integerY />
    </ChartCard>
  );
}

/** Indicadores de infraestructura (§13.2 infrastructure). */
export function InfrastructureCard() {
  const { query, key } = useAnalyticsFilters();
  const inf = useApiQuery(`a-inf|${key}`, () => api.analytics.infrastructure(query));
  const d = inf.data;
  return (
    <Card>
      <CardHeader title="Indicadores de infraestructura" description="Ciclovías y puntos de servicio de la zona metropolitana" />
      {inf.error && <Alert tone="error">{errorMessage(inf.error)}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Red de ciclovías" value={d ? formatDistance(d.cycleways_length_m) : "—"} hint={d ? `${formatDistance(d.cycleways_protected_length_m)} protegidas (${formatPercent(d.cycleways_length_m ? d.cycleways_protected_length_m / d.cycleways_length_m : null)})` : undefined} />
        {POI_CATEGORIES.map((c) => <StatTile key={c} label={POI_CATEGORY_LABELS[c]} value={d ? formatNumber(d.pois_by_category[c] ?? 0) : "—"} accent="blue" />)}
        <StatTile label="Puntos inactivos" value={d ? formatNumber(d.pois_inactive) : "—"} accent="yellow" />
      </div>
      <MetaNotes meta={d?.meta as AnalyticsMeta | undefined} />
    </Card>
  );
}
