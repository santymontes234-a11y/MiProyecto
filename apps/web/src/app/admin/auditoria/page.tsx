"use client";

import { useState } from "react";
import { hasRoleAtLeast, type AuditLog } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { fetchAllPages, timestampedName } from "@/lib/export";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { useSession } from "@/components/auth/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { FilterInput } from "@/components/ui/Fields";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/StateViews";

const PAGE_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const columns: Column<AuditLog>[] = [
  { key: "date", header: "Fecha", cell: (l) => formatDateTime(l.created_at) },
  { key: "action", header: "Acción", cell: (l) => <Badge tone="blue">{l.action}</Badge> },
  { key: "entity", header: "Entidad", cell: (l) => <span>{l.entity_type}{l.entity_id && <code className="ml-1 text-xs text-ink-muted">{l.entity_id.slice(0, 8)}</code>}</span> },
  { key: "actor", header: "Actor", cell: (l) => (l.actor_id ? <code className="text-xs">{l.actor_id.slice(0, 8)}</code> : <span className="text-ink-muted">Sistema</span>) },
  { key: "payload", header: "Detalle", cell: (l) => <code className="block max-w-xs truncate text-xs text-ink-muted" title={JSON.stringify(l.payload)}>{JSON.stringify(l.payload)}</code> },
];

export default function AuditPage() {
  const { user } = useSession();
  const allowed = hasRoleAtLeast(user.role, "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const actorValid = actor === "" || UUID_RE.test(actor.trim());
  const filters = { action: action.trim() || undefined, actor_id: actor.trim() && actorValid ? actor.trim() : undefined };
  const logs = useApiQuery(allowed && actorValid ? JSON.stringify({ page, ...filters }) : null, () => api.admin.auditLogs({ ...filters, page, page_size: PAGE_SIZE }));

  if (!allowed) return <EmptyState title="Acceso restringido" description="La auditoría solo está disponible para superadministradores." />;

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro inmutable de acciones administrativas."
        actions={
          <ExportButtons
            getCsv={async () => {
              const all = await fetchAllPages((p, size) => api.admin.auditLogs({ ...filters, page: p, page_size: size }));
              return { filename: timestampedName("ecomove-auditoria", "csv"), headers: ["id", "fecha", "accion", "entidad", "entidad_id", "actor_id", "payload"], rows: all.map((l) => [l.id, l.created_at, l.action, l.entity_type, l.entity_id, l.actor_id, JSON.stringify(l.payload)]) };
            }}
          />
        }
      />
      <Card>
        <div className="no-print mb-4 flex flex-wrap items-end gap-3">
          <FilterInput label="Acción" placeholder="p. ej. USER_ROLE_CHANGED" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
          <FilterInput label="ID del actor" placeholder="UUID" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} aria-invalid={!actorValid} className="min-w-72" />
        </div>
        {!actorValid && <p role="alert" className="mb-3 text-sm text-alert">El ID del actor debe ser un UUID válido.</p>}
        <DataTable caption="Registros de auditoría" columns={columns} rows={logs.data?.items} rowKey={(l) => l.id} loading={logs.loading} error={logs.error ? errorMessage(logs.error) : null} onRetry={logs.refetch} emptyTitle="Sin registros" />
        {logs.data && <Pagination page={logs.data.page} pageSize={logs.data.page_size} total={logs.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
