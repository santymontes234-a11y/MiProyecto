"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MODE_LABELS, TRANSPORT_MODES, TRIP_SOURCES, formatCo2, formatDistance, formatDuration, type AdminTripQuery, type AdminTripSummary, type TransportMode, type TripSource, type TripStatus } from "@ecomove/shared";
import { api } from "@/lib/api";
import { dateInputToIso, formatDateTime } from "@/lib/format";
import { TRIP_SOURCE_LABELS } from "@/lib/labels";
import { reasonSchema, type ReasonInput } from "@/lib/validation/schemas";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { FilterInput, FilterSelect, TextareaField } from "@/components/ui/Fields";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/StateViews";
import { ReportGenerator } from "@/components/admin/ReportGenerator";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AdminTripsPage() {
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deleting, setDeleting] = useState<AdminTripSummary | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const userValid = userId === "" || UUID_RE.test(userId.trim());
  const q: AdminTripQuery = {
    mode: (mode || undefined) as TransportMode | undefined,
    status: (status || undefined) as TripStatus | undefined,
    source: (source || undefined) as TripSource | undefined,
    user_id: userId.trim() && userValid ? userId.trim() : undefined,
    from: from ? dateInputToIso(from) : undefined,
    to: to ? dateInputToIso(to, true) : undefined,
  };
  const list = useApiQuery(userValid ? JSON.stringify({ page, ...q }) : null, () => api.admin.trips({ ...q, page, page_size: 20 }));
  const reset = () => setPage(1);

  const columns: Column<AdminTripSummary>[] = [
    { key: "date", header: "Inicio", cell: (t) => <span className="whitespace-nowrap">{formatDateTime(t.started_at)}</span> },
    { key: "mode", header: "Medio", cell: (t) => <ModeBadge mode={t.mode} /> },
    { key: "user", header: "Usuario", cell: (t) => <button type="button" className="font-mono text-xs underline" title="Filtrar por este usuario" onClick={() => { setUserId(t.user_id); reset(); }}>{t.user_id.slice(0, 8)}</button> },
    { key: "src", header: "Origen", cell: (t) => <Badge>{TRIP_SOURCE_LABELS[t.source]}</Badge> },
    { key: "dist", header: "Distancia", align: "right", cell: (t) => formatDistance(t.distance_m) },
    { key: "dur", header: "Duración", align: "right", cell: (t) => formatDuration(t.duration_s) },
    { key: "co2", header: "CO₂ evitado", align: "right", cell: (t) => formatCo2(t.co2_saved_g) },
    { key: "st", header: "Estado", cell: (t) => (t.status === "COMPLETED" ? <Badge tone="green">Completado</Badge> : <Badge>Cancelado</Badge>) },
    { key: "act", header: "", align: "right", cell: (t) => <Button size="sm" variant="ghost" onClick={() => setDeleting(t)}>Eliminar</Button> },
  ];

  return (
    <>
      <PageHeader title="Viajes" description="Todos los viajes de la plataforma, sin trazas (SECURITY §5)." actions={<ReportGenerator reportType="trips" />} />
      {flash && <div className="mb-4"><Alert tone="success">{flash}</Alert></div>}
      <Card>
        <div className="no-print mb-4 flex flex-wrap items-end gap-3">
          <FilterSelect label="Medio" value={mode} onChange={(v) => { setMode(v); reset(); }} options={[{ value: "", label: "Todos" }, ...TRANSPORT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))]} />
          <FilterSelect label="Estado" value={status} onChange={(v) => { setStatus(v); reset(); }} options={[{ value: "", label: "Todos" }, { value: "COMPLETED", label: "Completado" }, { value: "CANCELLED", label: "Cancelado" }]} />
          <FilterSelect label="Origen" value={source} onChange={(v) => { setSource(v); reset(); }} options={[{ value: "", label: "Todos" }, ...TRIP_SOURCES.map((s) => ({ value: s, label: TRIP_SOURCE_LABELS[s] }))]} />
          <FilterInput label="ID de usuario" placeholder="UUID" value={userId} onChange={(e) => { setUserId(e.target.value); reset(); }} aria-invalid={!userValid} className="min-w-64" />
          <FilterInput label="Desde" type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} />
          <FilterInput label="Hasta" type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} />
        </div>
        {!userValid && <p role="alert" className="mb-3 text-sm text-alert">El ID de usuario debe ser un UUID.</p>}
        <DataTable caption="Viajes" columns={columns} rows={list.data?.items} rowKey={(t) => t.id} loading={list.loading} error={list.error ? errorMessage(list.error) : null} onRetry={list.refetch} emptyTitle="No hay viajes con estos filtros" />
        {list.data && <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={setPage} />}
      </Card>
      {deleting && (
        <DeleteTripModal
          trip={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); setFlash("Viaje eliminado. Quedó registrado en la auditoría."); list.refetch(); }}
        />
      )}
    </>
  );
}

function DeleteTripModal({ trip, onClose, onDone }: { trip: AdminTripSummary; onClose: () => void; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<ReasonInput>({ resolver: zodResolver(reasonSchema) });
  const del = useMutation((reason: string) => api.admin.deleteTrip(trip.id, reason));
  return (
    <Modal open onClose={onClose} title="Eliminar viaje">
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async ({ reason }) => { if ((await del.run(reason)).ok) onDone(); })}>
        <p className="text-sm text-ink-muted">Viaje en {MODE_LABELS[trip.mode].toLowerCase()} del {formatDateTime(trip.started_at)}. Se recalcularán las estadísticas y los puntos del usuario.</p>
        {del.error && <Alert tone="error">{del.error}</Alert>}
        <TextareaField label="Motivo (queda en la auditoría)" error={errors.reason?.message} {...register("reason")} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={del.pending}>Eliminar</Button>
        </div>
      </form>
    </Modal>
  );
}
