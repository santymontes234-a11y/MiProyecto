"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CITIZEN_REPORT_CATEGORIES, type CitizenReport } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { CITIZEN_REPORT_CATEGORY_LABELS } from "@/lib/labels";
import { citizenReportSchema, type CitizenReportInput } from "@/lib/validation/schemas";
import { fieldErrorsFromApi } from "@/lib/validation/api-errors";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { ApiError } from "@ecomove/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField, TextareaField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { ReportStatusBadge } from "@/components/common/Labels";
import { MapView } from "@/components/map/MapView";

const columns: Column<CitizenReport>[] = [
  { key: "date", header: "Fecha", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
  { key: "title", header: "Reporte", cell: (r) => <span><span className="font-medium">{r.title}</span><span className="block text-xs text-ink-muted">{CITIZEN_REPORT_CATEGORY_LABELS[r.category]}</span></span> },
  { key: "status", header: "Estado", cell: (r) => <ReportStatusBadge status={r.status} /> },
  { key: "note", header: "Respuesta", cell: (r) => <span className="text-sm text-ink-muted">{r.resolution_note ?? "—"}</span> },
];

export default function CitizenReportsPage() {
  const [page, setPage] = useState(1);
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const mine = useApiQuery(`my-reports|${page}`, () => api.citizenReports.mine({ page, page_size: 10 }));
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CitizenReportInput>({ resolver: zodResolver(citizenReportSchema), defaultValues: { category: "BIKE_LANE_DAMAGE", description: "" } });

  async function onSubmit(v: CitizenReportInput) {
    setFlash(null);
    if (!point) {
      setFlash({ tone: "error", text: "Marca en el mapa dónde está el problema." });
      return;
    }
    try {
      await api.citizenReports.create({ ...v, location: { type: "Point", coordinates: point }, poi_id: null });
      reset();
      setPoint(null);
      setFlash({ tone: "success", text: "Gracias. Tu reporte se envió a la administración." });
      setPage(1);
      mine.refetch();
    } catch (e) {
      const fields = fieldErrorsFromApi(e);
      const text =
        e instanceof ApiError && e.code === "RATE_LIMITED" ? "Alcanzaste el límite de 10 reportes por día."
        : e instanceof ApiError && e.code === "TRIP_OUTSIDE_SERVICE_AREA" ? "El punto está fuera del área de servicio de EcoMove."
        : fields.location || fields.coordinates ? "La ubicación no es válida o está fuera del área de servicio."
        : e instanceof ApiError ? errorMessage(e) : "No se pudo enviar el reporte.";
      setFlash({ tone: "error", text });
    }
  }

  return (
    <>
      <PageHeader title="Reportar un problema" description="Avisa de daños en ciclovías, falta de infraestructura o problemas de seguridad vial." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Nuevo reporte" description="Haz clic en el mapa para marcar la ubicación." />
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}
            <SelectField label="Categoría" options={CITIZEN_REPORT_CATEGORIES.map((c) => ({ value: c, label: CITIZEN_REPORT_CATEGORY_LABELS[c] }))} error={errors.category?.message} {...register("category")} />
            <TextField label="Título" error={errors.title?.message} {...register("title")} />
            <TextareaField label="Descripción" error={errors.description?.message} {...register("description")} />
            <MapView label="Selecciona la ubicación del problema" height={300} draft={point} onMapClick={(lng, lat) => setPoint([lng, lat])} />
            <p className="text-xs text-ink-muted" aria-live="polite">{point ? `Ubicación: ${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : "Sin ubicación seleccionada"}</p>
            <Button type="submit" loading={isSubmitting}>Enviar reporte</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Mis reportes" />
          <DataTable caption="Mis reportes ciudadanos" columns={columns} rows={mine.data?.items} rowKey={(r) => r.id} loading={mine.loading} error={mine.error ? errorMessage(mine.error) : null} onRetry={mine.refetch} emptyTitle="Aún no has enviado reportes" />
          {mine.data && <Pagination page={mine.data.page} pageSize={mine.data.page_size} total={mine.data.total} onPage={setPage} />}
        </Card>
      </div>
    </>
  );
}
