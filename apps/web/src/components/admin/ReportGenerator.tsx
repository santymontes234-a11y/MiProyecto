"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { ApiError, type ReportFormat, type ReportType } from "@ecomove/shared";
import { api } from "@/lib/api";
import { downloadBlob, timestampedName } from "@/lib/export";
import { errorMessage } from "@/hooks/useApiQuery";
import { Button } from "@/components/ui/Button";

/**
 * Genera un informe en el servidor (POST /admin/reports, auditado, sin trazas) y lo descarga
 * (GET /admin/reports/{id}/download). Formatos CSV y PDF (§7.1).
 */
export async function generateAndDownload(reportType: ReportType, format: ReportFormat, range: { from?: string | null; to?: string | null } = {}) {
  const report = await api.admin.createReport({ report_type: reportType, format, from: range.from ?? null, to: range.to ?? null });
  const blob = await api.admin.downloadReport(report.id);
  downloadBlob(blob, timestampedName(`ecomove-${reportType}`, format));
  return report;
}

export function ReportGenerator({ reportType, range }: { reportType: ReportType; range?: { from?: string | null; to?: string | null } }) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(format: ReportFormat) {
    setBusy(format);
    setError(null);
    try {
      await generateAndDownload(reportType, format, range);
    } catch (e) {
      setError(e instanceof ApiError ? errorMessage(e) : "No se pudo generar el informe");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="no-print flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {(["csv", "pdf"] as const).map((f) => (
          <Button key={f} variant="secondary" size="sm" loading={busy === f} disabled={!!busy} onClick={() => run(f)}>
            {busy !== f && <FileDown className="size-4" aria-hidden="true" />} {f.toUpperCase()}
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-alert">{error}</p>}
    </div>
  );
}
