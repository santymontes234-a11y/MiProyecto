"use client";

import { useEffect, useState } from "react";
import { ROLES, ROLE_LABELS, hasRoleAtLeast, type Role, type User } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { fetchAllPages, timestampedName } from "@/lib/export";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { useSession } from "@/components/auth/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { FilterInput, FilterSelect } from "@/components/ui/Fields";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/StateViews";

const PAGE_SIZE = 20;

type Pending = { kind: "status"; user: User; next: boolean } | { kind: "role"; user: User; next: Role };

export default function AdminUsersPage() {
  const { user: me } = useSession();
  const isSuper = hasRoleAtLeast(me.role, "SUPER_ADMIN");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [active, setActive] = useState<"" | "true" | "false">("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { q: debouncedQ || undefined, role: role || undefined, is_active: active === "" ? undefined : active === "true" };
  const list = useApiQuery(JSON.stringify({ page, ...filters }), () => api.admin.users({ ...filters, page, page_size: PAGE_SIZE }));

  const mutate = useMutation(async (p: Pending) =>
    p.kind === "status" ? api.admin.setUserStatus(p.user.id, p.next) : api.admin.setUserRole(p.user.id, p.next),
  );

  async function confirm() {
    if (!pending) return;
    const res = await mutate.run(pending);
    if (res.ok) {
      setFlash(pending.kind === "status" ? `Usuario ${pending.next ? "activado" : "desactivado"}.` : `Rol actualizado a ${ROLE_LABELS[pending.next]}.`);
      setPending(null);
      list.refetch();
    }
  }

  const columns: Column<User>[] = [
    { key: "name", header: "Nombre", cell: (u) => <span className="font-medium">{u.full_name}{u.id === me.id && <span className="ml-2 text-xs text-ink-muted">(tú)</span>}</span> },
    { key: "email", header: "Correo", cell: (u) => u.email },
    {
      key: "role",
      header: "Rol",
      cell: (u) =>
        isSuper && u.id !== me.id ? (
          <select
            aria-label={`Rol de ${u.full_name}`}
            className="min-h-11 rounded-md border border-line bg-panel px-2 text-sm"
            value={u.role}
            onChange={(e) => setPending({ kind: "role", user: u, next: e.target.value as Role })}
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        ) : (
          <Badge tone={u.role === "USER" ? "gray" : "blue"}>{ROLE_LABELS[u.role]}</Badge>
        ),
    },
    { key: "status", header: "Estado", cell: (u) => (u.is_active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Inactivo</Badge>) },
    { key: "created", header: "Alta", cell: (u) => formatDate(u.created_at) },
    {
      key: "actions",
      header: "Acciones",
      align: "right",
      cell: (u) =>
        u.id === me.id || (!isSuper && u.role !== "USER") ? (
          <span className="text-xs text-ink-muted">—</span>
        ) : (
          <Button size="sm" variant={u.is_active ? "ghost" : "secondary"} onClick={() => setPending({ kind: "status", user: u, next: !u.is_active })}>
            {u.is_active ? "Desactivar" : "Activar"}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Usuarios"
        description={isSuper ? "Gestiona estado y roles. Toda acción queda en la auditoría." : "Activa o desactiva cuentas de usuarios. Los cambios de rol los hace un superadministrador."}
        actions={
          <ExportButtons
            getCsv={async () => {
              const all = await fetchAllPages((p, size) => api.admin.users({ ...filters, page: p, page_size: size }));
              return { filename: timestampedName("ecomove-usuarios", "csv"), headers: ["id", "nombre", "correo", "rol", "activo", "alta"], rows: all.map((u) => [u.id, u.full_name, u.email, u.role, u.is_active, u.created_at]) };
            }}
          />
        }
      />
      {flash && <div className="mb-4"><Alert tone="success">{flash}</Alert></div>}
      <Card>
        <div className="no-print mb-4 flex flex-wrap items-end gap-3">
          <FilterInput label="Buscar" type="search" placeholder="Nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-56" />
          <FilterSelect label="Rol" value={role} onChange={(v) => { setRole(v as Role | ""); setPage(1); }} options={[{ value: "", label: "Todos" }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]} />
          <FilterSelect label="Estado" value={active} onChange={(v) => { setActive(v as "" | "true" | "false"); setPage(1); }} options={[{ value: "", label: "Todos" }, { value: "true", label: "Activos" }, { value: "false", label: "Inactivos" }]} />
        </div>
        <DataTable caption="Usuarios" columns={columns} rows={list.data?.items} rowKey={(u) => u.id} loading={list.loading} error={list.error ? errorMessage(list.error) : null} onRetry={list.refetch} emptyTitle="No hay usuarios con estos filtros" />
        {list.data && <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={setPage} />}
      </Card>

      <Modal open={!!pending} onClose={() => { setPending(null); mutate.setError(null); }} title="Confirmar cambio">
        {pending && (
          <p className="text-sm text-ink-muted">
            {pending.kind === "status"
              ? `¿${pending.next ? "Activar" : "Desactivar"} la cuenta de ${pending.user.full_name}? ${pending.next ? "" : "Perderá el acceso de inmediato."}`
              : `¿Cambiar el rol de ${pending.user.full_name} a ${ROLE_LABELS[pending.next]}?`}
          </p>
        )}
        {mutate.error && <div className="mt-3"><Alert tone="error">{mutate.error}</Alert></div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setPending(null); mutate.setError(null); }}>Cancelar</Button>
          <Button variant={pending?.kind === "status" && !pending.next ? "danger" : "primary"} loading={mutate.pending} onClick={confirm}>Confirmar</Button>
        </div>
      </Modal>
    </>
  );
}
