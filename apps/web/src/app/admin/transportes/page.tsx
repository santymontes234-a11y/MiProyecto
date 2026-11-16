"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MODE_LABELS, hasRoleAtLeast, type EmissionFactor } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { timestampedName } from "@/lib/export";
import { emissionFactorSchema, type EmissionFactorInput } from "@/lib/validation/schemas";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { useSession } from "@/components/auth/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";

export default function TransportModesPage() {
  const { user } = useSession();
  const canEdit = hasRoleAtLeast(user.role, "SUPER_ADMIN");
  const factors = useApiQuery("factors", () => api.admin.emissionFactors());
  const [editing, setEditing] = useState<EmissionFactor | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const columns: Column<EmissionFactor>[] = [
    { key: "mode", header: "Medio", cell: (f) => <ModeBadge mode={f.mode} /> },
    { key: "factor", header: "Emisiones (g CO₂/km)", align: "right", cell: (f) => formatNumber(f.grams_per_km) },
    { key: "from", header: "Vigente desde", cell: (f) => formatDateTime(f.valid_from) },
    ...(canEdit ? [{ key: "edit", header: "", align: "right" as const, cell: (f: EmissionFactor) => <Button size="sm" variant="secondary" onClick={() => setEditing(f)}>Editar</Button> }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Medios de transporte"
        description="Factores de emisión con los que el servidor calcula el CO₂. Los viajes ya registrados conservan el factor con el que se calcularon."
        actions={
          <ExportButtons
            getCsv={async () => {
              const d = factors.data ?? (await api.admin.emissionFactors());
              return { filename: timestampedName("ecomove-factores", "csv"), headers: ["medio", "g_co2_km", "vigente_desde"], rows: d.map((f) => [MODE_LABELS[f.mode], f.grams_per_km, f.valid_from]) };
            }}
          />
        }
      />
      {!canEdit && <div className="mb-4"><Alert tone="info">Solo un superadministrador puede modificar los factores de emisión.</Alert></div>}
      {flash && <div className="mb-4"><Alert tone="success">{flash}</Alert></div>}
      <Card>
        <DataTable caption="Factores de emisión" columns={columns} rows={factors.data} rowKey={(f) => f.mode} loading={factors.loading} error={factors.error ? errorMessage(factors.error) : null} onRetry={factors.refetch} emptyTitle="No hay factores configurados" />
      </Card>
      {editing && (
        <EditFactorModal
          factor={editing}
          onClose={() => setEditing(null)}
          onSaved={(f) => {
            setEditing(null);
            setFlash(`Factor de ${MODE_LABELS[f.mode]} actualizado a ${formatNumber(f.grams_per_km)} g/km.`);
            factors.refetch();
          }}
        />
      )}
    </>
  );
}

function EditFactorModal({ factor, onClose, onSaved }: { factor: EmissionFactor; onClose: () => void; onSaved: (f: EmissionFactor) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<EmissionFactorInput>({ resolver: zodResolver(emissionFactorSchema), defaultValues: { grams_per_km: factor.grams_per_km } });
  const save = useMutation((v: EmissionFactorInput) => api.admin.setEmissionFactor(factor.mode, v.grams_per_km));
  return (
    <Modal open onClose={onClose} title={`Factor de emisión: ${MODE_LABELS[factor.mode]}`}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          const res = await save.run(v);
          if (res.ok) onSaved(res.data);
        })}
      >
        <Alert tone="warning">El nuevo valor se aplicará a los viajes que se registren a partir de ahora.</Alert>
        {save.error && <Alert tone="error">{save.error}</Alert>}
        <TextField label="Gramos de CO₂ por km" type="number" inputMode="decimal" step="0.1" min={0} error={errors.grams_per_km?.message} {...register("grams_per_km")} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.pending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
