"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { ApiError } from "@ecomove/shared";
import { downloadText, toCsv, type Cell } from "@/lib/export";
import { Button } from "./Button";

export interface CsvPayload {
  filename: string;
  headers: string[];
  rows: Cell[][];
}

/**
 * Botones de exportación: CSV (generado a partir de datos de la API) y PDF mediante la vista
 * de impresión del navegador («Guardar como PDF»).
 */
export function ExportButtons({ getCsv, pdf = true }: { getCsv?: () => Promise<CsvPayload>; pdf?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function csv() {
    if (!getCsv) return;
    setBusy(true);
    setError(null);
    try {
      const p = await getCsv();
      downloadText(toCsv(p.headers, p.rows), p.filename);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo exportar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {getCsv && (
          <Button variant="secondary" size="sm" loading={busy} onClick={csv}>
            {!busy && <Download className="size-4" aria-hidden="true" />} CSV
          </Button>
        )}
        {pdf && (
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" /> PDF
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-alert">{error}</p>}
    </div>
  );
}
