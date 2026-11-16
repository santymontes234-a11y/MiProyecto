"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/StateViews";
import { Segmented } from "@/components/ui/Segmented";

export interface TableSpec {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Envoltorio estándar de gráfica: título, acciones, estados de carga/vacío/error
 * y una vista de tabla accesible alternativa.
 */
export function ChartCard({ title, description, actions, loading, error, onRetry, empty, table, children, height = 280, className }: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  table?: TableSpec;
  children: React.ReactNode;
  height?: number;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const headerActions = (
    <>
      {actions}
      {table && !empty && !loading && !error && (
        <Segmented label={`Vista de ${title}`} value={view} onChange={setView} options={[{ value: "chart", label: "Gráfica" }, { value: "table", label: "Tabla" }]} />
      )}
    </>
  );

  let body: React.ReactNode;
  if (error) body = <ErrorState message={error} onRetry={onRetry} />;
  else if (loading) body = <div style={{ height }} role="status" aria-label="Cargando gráfica"><Skeleton className="h-full w-full" /></div>;
  else if (empty) body = <EmptyState title="Aún no hay datos" description="Cuando haya actividad en este periodo aparecerá aquí." />;
  else if (view === "table" && table) body = <SimpleTable spec={table} caption={title} />;
  else body = <div style={{ height }} className="w-full">{children}</div>;

  return (
    <Card className={className} aria-label={title}>
      <CardHeader title={title} description={description} actions={headerActions} />
      {body}
    </Card>
  );
}

function SimpleTable({ spec, caption }: { spec: TableSpec; caption: string }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-panel">
          <tr>
            {spec.headers.map((h, i) => (
              <th key={h} scope="col" className={`border-b border-line px-3 py-2 text-xs font-semibold text-ink-muted ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className={`border-b border-line px-3 py-2 ${ci === 0 ? "text-left" : "text-right tabular-nums"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
