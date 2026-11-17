"use client";

import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, LoadingBlock, Alert } from "@/components/ui/StateViews";

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const list = useApiQuery(`notif|${page}|${filter}`, () => api.notifications.list({ page, page_size: 20, unread_only: filter === "unread" || undefined }));
  const markAll = useMutation(() => api.notifications.markAllRead());
  const markOne = useMutation((id: string) => api.notifications.markRead(id));

  return (
    <>
      <PageHeader
        title="Notificaciones"
        description={list.data ? `${list.data.unread_count} sin leer` : "Avisos de logros y resúmenes semanales."}
        actions={
          <Button variant="secondary" size="sm" loading={markAll.pending} disabled={!list.data?.unread_count} onClick={async () => { if ((await markAll.run()).ok) list.refetch(); }}>
            <CheckCheck className="size-4" aria-hidden="true" /> Marcar todas como leídas
          </Button>
        }
      />
      {(markAll.error || markOne.error) && <div className="mb-4"><Alert tone="error">{markAll.error ?? markOne.error}</Alert></div>}
      <Card>
        <div className="mb-4"><Segmented label="Filtro" value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[{ value: "all", label: "Todas" }, { value: "unread", label: "Sin leer" }]} /></div>
        {list.loading && !list.data ? (
          <LoadingBlock />
        ) : list.error ? (
          <ErrorState message={errorMessage(list.error)} onRetry={list.refetch} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Bell className="size-6" />} title={filter === "unread" ? "No tienes notificaciones sin leer" : "Sin notificaciones"} description="Aquí verás tus logros nuevos y resúmenes." />
        ) : (
          <ul className="divide-y divide-line">
            {list.data.items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className={n.read_at ? "text-ink" : "font-semibold text-ink"}>{n.title}{!n.read_at && <span className="sr-only"> (sin leer)</span>}</p>
                  <p className="text-sm text-ink-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatDateTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <Button variant="ghost" size="sm" onClick={async () => { if ((await markOne.run(n.id)).ok) list.refetch(); }}>Marcar leída</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {list.data && <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
