"use client";

import { useState } from "react";
import Link from "next/link";
import { MODE_LABELS, TRANSPORT_MODES, formatCo2, formatDistance, formatDuration, type TransportMode, type TripListQuery, type TripSummary } from "@ecomove/shared";
import { api } from "@/lib/api";
import { dateInputToIso, formatDateTime } from "@/lib/format";
import { fetchAllPages, timestampedName } from "@/lib/export";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { FilterInput, FilterSelect } from "@/components/ui/Fields";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { TRIP_CSV_HEADERS, tripToCsvRow } from "@/components/trips/tripCsv";

const PAGE_SIZE = 20;

const columns: Column<TripSummary>[] = [
  { key: "date", header: "Fecha", cell: (t) => <Link className="whitespace-nowrap font-medium text-brand-strong underline-offset-2 hover:underline" href={`/app/viajes/${encodeURIComponent(t.id)}`}>{formatDateTime(t.started_at)}</Link> },
  { key: "mode", header: "Medio", cell: (t) => <ModeBadge mode={t.mode} /> },
  { key: "distance", header: "Distancia", align: "right", cell: (t) => formatDistance(t.distance_m) },
  { key: "duration", header: "Duración", align: "right", cell: (t) => formatDuration(t.duration_s) },
  { key: "saved", header: "CO₂ evitado", align: "right", cell: (t) => <span className="font-semibold text-brand-strong">{formatCo2(t.co2_saved_g)}</span> },
  { key: "emitted", header: "CO₂ emitido", align: "right", cell: (t) => formatCo2(t.co2_emitted_g) },
  { key: "points", header: "Puntos", align: "right", cell: (t) => t.points },
  { key: "status", header: "Estado", cell: (t) => (t.status === "COMPLETED" ? <Badge tone="green">Completado</Badge> : <Badge tone="gray">Cancelado</Badge>) },
  { key: "actions", header: "Acciones", align: "right", cell: (t) => <Link className="inline-flex min-h-11 items-center text-sm font-medium text-brand-strong underline" href={`/app/viajes/${encodeURIComponent(t.id)}`}>Ver o editar</Link> },
];

export default function TripsPage() {
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<TransportMode | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters: TripListQuery = { mode: mode || undefined, from: from ? dateInputToIso(from) : undefined, to: to ? dateInputToIso(to, true) : undefined };
  const invalidRange = !!from && !!to && from > to;
  const key = invalidRange ? null : JSON.stringify({ page, ...filters });
  const { data, error, loading, refetch } = useApiQuery(key, () => api.trips.list({ ...filters, page, page_size: PAGE_SIZE }));

  function update<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <>
      <PageHeader
        title="Historial de viajes"
        description="Todos tus trayectos registrados. El CO₂ lo calcula el servidor de EcoMove."
        actions={
          <>
          <ButtonLink href="/app/viajes/nuevo" size="sm">Registrar viaje</ButtonLink>
          <ExportButtons
            getCsv={async () => {
              const all = await fetchAllPages((p, size) => api.trips.list({ ...filters, page: p, page_size: size }));
              return { filename: timestampedName("ecomove-mis-viajes", "csv"), headers: TRIP_CSV_HEADERS, rows: all.map(tripToCsvRow) };
            }}
          />
          </>
        }
      />
      <Card>
        <div className="no-print mb-4 flex flex-wrap items-end gap-3">
          <FilterSelect label="Medio" value={mode} onChange={update((v: string) => setMode(v as TransportMode | ""))} options={[{ value: "", label: "Todos" }, ...TRANSPORT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))]} />
          <FilterInput label="Desde" type="date" value={from} max={to || undefined} onChange={(e) => update(setFrom)(e.target.value)} />
          <FilterInput label="Hasta" type="date" value={to} min={from || undefined} onChange={(e) => update(setTo)(e.target.value)} />
          {(mode || from || to) && (
            <button type="button" className="min-h-11 text-sm font-medium text-brand-strong underline" onClick={() => { setMode(""); setFrom(""); setTo(""); setPage(1); }}>
              Limpiar filtros
            </button>
          )}
        </div>
        {invalidRange && <p role="alert" className="mb-3 text-sm text-alert">La fecha «Desde» debe ser anterior a «Hasta».</p>}
        <DataTable
          caption="Historial de viajes"
          columns={columns}
          rows={data?.items}
          rowKey={(t) => t.id}
          loading={loading}
          error={error ? errorMessage(error) : null}
          onRetry={refetch}
          emptyTitle={mode || from || to ? "No hay viajes con estos filtros" : "Aún no tienes viajes"}
          emptyDescription={mode || from || to ? "Prueba con otro medio o rango de fechas." : "Registra tu primer trayecto desde la app Android de EcoMove."}
        />
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
