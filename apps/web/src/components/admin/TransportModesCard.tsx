"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MODE_LABELS, type TransportModeInfo } from "@ecomove/shared";
import { api } from "@/lib/api";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CheckboxField, TextField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";

const schema = z.object({ max_speed_kmh: z.coerce.number<number>().gt(0, "Mayor que 0").max(300, "Máximo 300"), is_active: z.boolean() });
type Input = z.infer<typeof schema>;

/** Medios de transporte (§8 catálogo, §7 PATCH SUPER_ADMIN): velocidad máxima y activación. */
export function TransportModesCard({ canEdit }: { canEdit: boolean }) {
  const modes = useApiQuery("catalog-modes", () => api.catalog.transportModes());
  const [editing, setEditing] = useState<TransportModeInfo | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const columns: Column<TransportModeInfo>[] = [
    { key: "mode", header: "Medio", cell: (m) => <ModeBadge mode={m.mode} /> },
    { key: "speed", header: "Velocidad máx.", align: "right", cell: (m) => `${m.max_speed_kmh} km/h` },
    { key: "active", header: "Estado", cell: (m) => (m.is_active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>) },
    ...(canEdit ? [{ key: "e", header: "", align: "right" as const, cell: (m: TransportModeInfo) => <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>Editar</Button> }] : []),
  ];
  return (
    <Card>
      <CardHeader title="Medios de transporte" description="Un viaje con velocidad media superior al máximo se rechaza; un medio inactivo no admite viajes nuevos." />
      {flash && <div className="mb-3"><Alert tone="success">{flash}</Alert></div>}
      <DataTable caption="Medios de transporte" columns={columns} rows={modes.data} rowKey={(m) => m.mode} loading={modes.loading} error={modes.error ? errorMessage(modes.error) : null} onRetry={modes.refetch} />
      {editing && <EditModal mode={editing} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); setFlash(`${MODE_LABELS[m.mode]} actualizado.`); modes.refetch(); }} />}
    </Card>
  );
}

function EditModal({ mode, onClose, onDone }: { mode: TransportModeInfo; onClose: () => void; onDone: (m: TransportModeInfo) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { max_speed_kmh: mode.max_speed_kmh, is_active: mode.is_active } });
  const save = useMutation((v: Input) => api.admin.updateTransportMode(mode.mode, v));
  return (
    <Modal open onClose={onClose} title={`Medio: ${MODE_LABELS[mode.mode]}`}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { const r = await save.run(v); if (r.ok) onDone(r.data); })}>
        {save.error && <Alert tone="error">{save.error}</Alert>}
        <TextField label="Velocidad máxima (km/h)" type="number" step="1" min={1} max={300} error={errors.max_speed_kmh?.message} {...register("max_speed_kmh")} />
        <CheckboxField label="Activo" description="Si lo desactivas, la app ya no podrá registrar viajes con este medio." {...register("is_active")} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.pending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
