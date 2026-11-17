"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CITIZEN_REPORT_CATEGORIES, CITIZEN_REPORT_STATUSES, type CitizenReport, type CitizenReportCategory, type CitizenReportStatus } from "@ecomove/shared";
import { api } from "@/lib/api";
import { dateInputToIso, formatDateTime } from "@/lib/format";
import { CITIZEN_REPORT_CATEGORY_LABELS, CITIZEN_REPORT_STATUS_LABELS } from "@/lib/labels";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { FilterInput, FilterSelect, SelectField, TextareaField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/StateViews";
import { ReportStatusBadge } from "@/components/common/Labels";
import { ReportGenerator } from "@/components/admin/ReportGenerator";
import { MapView } from "@/components/map/MapView";

const updateSchema = z.object({ status: z.enum(CITIZEN_REPORT_STATUSES), resolution_note: z.string().trim().max(1000, "Máximo 1000 caracteres") });
type UpdateInput = z.infer<typeof updateSchema>;

export default function AdminCitizenReportsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<CitizenReport | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const q = {
    status: (status || undefined) as CitizenReportStatus | undefined,
    category: (category || undefined) as CitizenReportCategory | undefined,
    from: from ? dateInputToIso(from) : undefined,
    to: to ? dateInputToIso(to, true) : undefined,
  };
  const list = useApiQuery(JSON.stringify({ page, ...q }), () => api.admin.citizenReports({ ...q, page, page_size: 20 }));

  const columns: Column<CitizenReport>[] = [
    { key: "date", header: "Fecha", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
    { key: "title", header: "Reporte", cell: (r) => <span><span className="font-medium">{r.title}</span><span className="block text-xs text-ink-muted">{CITIZEN_REPORT_CATEGORY_LABELS[r.category]}</span></span> },
    { key: "status", header: "Estado", cell: (r) => <ReportStatusBadge status={r.status} /> },
    { key: "act", header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>Gestionar</Button> },
  ];

  return (
    <>
      <PageHeader title="Reportes ciudadanos" description="Incidencias reportadas por la ciudadanía. Sin datos personales del reportante." actions={<ReportGenerator reportType="citizen_reports" />} />
      {flash && <div className="mb-4"><Alert tone="success">{flash}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <div className="no-print mb-4 flex flex-wrap items-end gap-3">
            <FilterSelect label="Estado" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "Todos" }, ...CITIZEN_REPORT_STATUSES.map((s) => ({ value: s, label: CITIZEN_REPORT_STATUS_LABELS[s] }))]} />
            <FilterSelect label="Categoría" value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={[{ value: "", label: "Todas" }, ...CITIZEN_REPORT_CATEGORIES.map((c) => ({ value: c, label: CITIZEN_REPORT_CATEGORY_LABELS[c] }))]} />
            <FilterInput label="Desde" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <FilterInput label="Hasta" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <DataTable caption="Reportes ciudadanos" columns={columns} rows={list.data?.items} rowKey={(r) => r.id} loading={list.loading} error={list.error ? errorMessage(list.error) : null} onRetry={list.refetch} emptyTitle="No hay reportes con estos filtros" />
          {list.data && <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={setPage} />}
        </Card>
        <Card>
          <CardHeader title="Ubicación" description={selected ? selected.title : "Selecciona un reporte para verlo en el mapa"} />
          <MapView label="Ubicación del reporte" height={360} center={selected?.location.coordinates} zoom={selected ? 16 : undefined} draft={selected?.location.coordinates ?? null} key={selected?.id ?? "none"} />
        </Card>
      </div>
      {selected && (
        <UpdateModal
          report={selected}
          onClose={() => setSelected(null)}
          onDone={(r) => { setSelected(r); setFlash(`Reporte «${r.title}» actualizado a ${CITIZEN_REPORT_STATUS_LABELS[r.status].toLowerCase()}.`); list.refetch(); }}
        />
      )}
    </>
  );
}

function UpdateModal({ report, onClose, onDone }: { report: CitizenReport; onClose: () => void; onDone: (r: CitizenReport) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<UpdateInput>({ resolver: zodResolver(updateSchema), defaultValues: { status: report.status, resolution_note: report.resolution_note ?? "" } });
  const save = useMutation((v: UpdateInput) => api.admin.updateCitizenReport(report.id, { status: v.status, resolution_note: v.resolution_note || undefined }));
  return (
    <Modal open onClose={onClose} title={report.title}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { const r = await save.run(v); if (r.ok) onDone(r.data); })}>
        <p className="text-sm text-ink-muted">{CITIZEN_REPORT_CATEGORY_LABELS[report.category]} · {formatDateTime(report.created_at)}</p>
        <p className="whitespace-pre-wrap text-sm">{report.description || "Sin descripción."}</p>
        {save.error && <Alert tone="error">{save.error}</Alert>}
        <SelectField label="Estado" options={CITIZEN_REPORT_STATUSES.map((s) => ({ value: s, label: CITIZEN_REPORT_STATUS_LABELS[s] }))} {...register("status")} />
        <TextareaField label="Respuesta al ciudadano (opcional)" error={errors.resolution_note?.message} {...register("resolution_note")} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button type="submit" loading={save.pending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
