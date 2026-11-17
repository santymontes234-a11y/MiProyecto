"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ACHIEVEMENT_CRITERIA, type Achievement } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { ACHIEVEMENT_CRITERION_LABELS } from "@/lib/labels";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CheckboxField, SelectField, TextField, TextareaField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";
import { Badge } from "@/components/ui/Badge";

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, "2–40 caracteres: A-Z, 0-9 o _"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  icon: z.string().trim().max(40),
  criterion: z.enum(ACHIEVEMENT_CRITERIA),
  threshold: z.coerce.number<number>().gt(0, "Mayor que 0"),
  bonus_points: z.coerce.number<number>().int().min(0).max(10000),
  is_active: z.boolean(),
});
type Input = z.infer<typeof schema>;

/**
 * Catálogo de logros. GET /achievements solo devuelve los activos: los desactivados desaparecen
 * de esta lista (el contrato no ofrece listado admin de inactivos).
 */
export default function AdminAchievementsPage() {
  const list = useApiQuery("achievements", () => api.gamification.achievements());
  const [editing, setEditing] = useState<Achievement | "new" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const columns: Column<Achievement>[] = [
    { key: "code", header: "Código", cell: (a) => <code className="text-xs">{a.code}</code> },
    { key: "name", header: "Logro", cell: (a) => <span><span className="font-medium">{a.name}</span><span className="block text-xs text-ink-muted">{a.description}</span></span> },
    { key: "crit", header: "Criterio", cell: (a) => `${ACHIEVEMENT_CRITERION_LABELS[a.criterion]} ≥ ${formatNumber(a.threshold)}` },
    { key: "bonus", header: "Bonificación", align: "right", cell: (a) => <Badge tone="yellow">+{formatNumber(a.bonus_points)}</Badge> },
    { key: "e", header: "", align: "right", cell: (a) => <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>Editar</Button> },
  ];
  return (
    <>
      <PageHeader title="Logros" description="Catálogo de logros que el backend otorga automáticamente." actions={<Button onClick={() => setEditing("new")}>Nuevo logro</Button>} />
      {flash && <div className="mb-4"><Alert tone="success">{flash}</Alert></div>}
      <Card>
        <DataTable caption="Logros" columns={columns} rows={list.data} rowKey={(a) => a.id} loading={list.loading} error={list.error ? errorMessage(list.error) : null} onRetry={list.refetch} emptyTitle="No hay logros activos" />
      </Card>
      {editing && <AchievementEditor achievement={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); setFlash(m); list.refetch(); }} />}
    </>
  );
}

function AchievementEditor({ achievement: a, onClose, onDone }: { achievement: Achievement | null; onClose: () => void; onDone: (msg: string) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<Input>({
    resolver: zodResolver(schema),
    defaultValues: a ? { code: a.code, name: a.name, description: a.description, icon: a.icon, criterion: a.criterion, threshold: a.threshold, bonus_points: a.bonus_points, is_active: a.is_active } : { criterion: "TRIPS_COUNT", bonus_points: 0, is_active: true, icon: "award", description: "" },
  });
  const save = useMutation(async (v: Input) => {
    if (a) {
      const { code: _code, ...rest } = v;
      return api.admin.updateAchievement(a.id, rest);
    }
    return api.admin.createAchievement(v);
  });
  return (
    <Modal open onClose={onClose} title={a ? `Editar ${a.name}` : "Nuevo logro"}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { if ((await save.run(v)).ok) onDone(a ? "Logro actualizado." : "Logro creado."); })}>
        {save.error && <Alert tone="error">{save.error}</Alert>}
        <TextField label="Código" disabled={!!a} hint={a ? "El código es inmutable." : undefined} error={errors.code?.message} {...register("code")} />
        <TextField label="Nombre" error={errors.name?.message} {...register("name")} />
        <TextareaField label="Descripción" error={errors.description?.message} {...register("description")} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Criterio" options={ACHIEVEMENT_CRITERIA.map((c) => ({ value: c, label: ACHIEVEMENT_CRITERION_LABELS[c] }))} {...register("criterion")} />
          <TextField label="Umbral" type="number" min={1} error={errors.threshold?.message} {...register("threshold")} />
          <TextField label="Puntos extra" type="number" min={0} max={10000} error={errors.bonus_points?.message} {...register("bonus_points")} />
          <TextField label="Icono" hint="Nombre corto, p. ej. bicycle" error={errors.icon?.message} {...register("icon")} />
        </div>
        <CheckboxField label="Activo" {...register("is_active")} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.pending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
