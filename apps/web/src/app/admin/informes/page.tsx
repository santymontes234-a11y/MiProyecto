"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download } from "lucide-react";
import { ApiError, REPORT_FORMATS, REPORT_TYPES, hasRoleAtLeast, type Report } from "@ecomove/shared";
import { api } from "@/lib/api";
import { dateInputToIso, formatDateTime, formatNumber } from "@/lib/format";
import { downloadBlob, timestampedName } from "@/lib/export";
import { REPORT_TYPE_LABELS } from "@/lib/labels";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { useSession } from "@/components/auth/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/StateViews";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";

const schema = z
  .object({ report_type: z.enum(REPORT_TYPES), format: z.enum(REPORT_FORMATS), from: z.string(), to: z.string() })
  .refine((d) => !d.from || !d.to || d.from <= d.to, { path: ["to"], message: "«Hasta» debe ser posterior a «Desde»" });
type Input = z.infer<typeof schema>;

export default function ReportsPage() {
  const { user } = useSession();
  const isSuper = hasRoleAtLeast(user.role, "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const list = useApiQuery(`reports|${page}`, () => api.admin.reports({ page, page_size: 20 }));
  const types = REPORT_TYPES.filter((t) => t !== "audit_logs" || isSuper);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { report_type: "overview", format: "csv", from: "", to: "" } });

  async function download(r: Report) {
    setDownloading(r.id);
    setMsg(null);
    try {
      downloadBlob(await api.admin.downloadReport(r.id), timestampedName(`ecomove-${r.report_type}`, r.format));
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? errorMessage(e) : "No se pudo descargar" });
    } finally {
      setDownloading(null);
    }
  }

  async function onSubmit(v: Input) {
    setMsg(null);
    try {
      const r = await api.admin.createReport({ report_type: v.report_type, format: v.format, from: v.from ? dateInputToIso(v.from) ?? null : null, to: v.to ? dateInputToIso(v.to, true) ?? null : null });
      setMsg({ tone: "success", text: `Informe generado (${formatNumber(r.row_count)} filas).` });
      setPage(1);
      list.refetch();
      await download(r);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? errorMessage(e) : "No se pudo generar" });
    }
  }

  const columns: Column<Report>[] = [
    { key: "date", header: "Generado", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
    { key: "type", header: "Tipo", cell: (r) => REPORT_TYPE_LABELS[r.report_type] },
    { key: "fmt", header: "Formato", cell: (r) => <Badge tone="blue">{r.format.toUpperCase()}</Badge> },
    { key: "range", header: "Rango", cell: (r) => (r.parameters.from || r.parameters.to ? `${r.parameters.from ? formatDateTime(r.parameters.from) : "…"} – ${r.parameters.to ? formatDateTime(r.parameters.to) : "…"}` : "Todo") },
    { key: "rows", header: "Filas", align: "right", cell: (r) => formatNumber(r.row_count) },
    { key: "dl", header: "", align: "right", cell: (r) => <Button size="sm" variant="secondary" loading={downloading === r.id} onClick={() => download(r)}>{downloading !== r.id && <Download className="size-4" aria-hidden="true" />} Descargar</Button> },
  ];

  return (
    <>
      <PageHeader title="Informes y exportación" description="CSV/PDF generados en el servidor: sin trazas, coordenadas, correos ni nombres. Cada generación y descarga queda auditada." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader title="Nuevo informe" />
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <SelectField label="Tipo" options={types.map((t) => ({ value: t, label: REPORT_TYPE_LABELS[t] }))} {...register("report_type")} />
            <SelectField label="Formato" options={[{ value: "csv", label: "CSV" }, { value: "pdf", label: "PDF" }]} {...register("format")} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Desde (opcional)" type="date" {...register("from")} />
              <TextField label="Hasta (opcional)" type="date" error={errors.to?.message} {...register("to")} />
            </div>
            <Button type="submit" loading={isSubmitting}>Generar y descargar</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Historial" />
          <DataTable caption="Informes generados" columns={columns} rows={list.data?.items} rowKey={(r) => r.id} loading={list.loading} error={list.error ? errorMessage(list.error) : null} onRetry={list.refetch} emptyTitle="Aún no se han generado informes" />
          {list.data && <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={setPage} />}
        </Card>
      </div>
    </>
  );
}
