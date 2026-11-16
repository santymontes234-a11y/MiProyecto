"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { POI_CATEGORIES, POI_CATEGORY_LABELS, type PoiCreate, type PoiFeature } from "@ecomove/shared";
import { api } from "@/lib/api";
import { poiFormSchema, type PoiFormInput } from "@/lib/validation/schemas";
import { useMutation } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CheckboxField, SelectField, TextField, TextareaField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";
import { InfrastructureMap } from "@/components/map/InfrastructureMap";

type Editor = { mode: "create"; lng: number; lat: number } | { mode: "edit"; poi: PoiFeature };

function toBody(v: PoiFormInput, base: Record<string, unknown> = {}): PoiCreate {
  const attributes: Record<string, unknown> = { ...base };
  if (v.capacity === "" || v.capacity === undefined) delete attributes.capacity;
  else attributes.capacity = v.capacity;
  return {
    name: v.name,
    category: v.category,
    description: v.description ? v.description : null,
    location: { type: "Point", coordinates: [v.lng, v.lat] },
    attributes,
  };
}

export default function StationsPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  function done(msg: string) {
    setEditor(null);
    setFlash(msg);
    setReloadKey((k) => k + 1);
  }

  return (
    <>
      <PageHeader
        title="Estaciones e infraestructura"
        description="Estacionamientos y bicicletas compartidas, paradas, cargadores y estaciones de reparación."
        actions={<Button onClick={() => { setPlacing(true); setFlash(null); }}>Nuevo punto</Button>}
      />
      <div className="mb-4 space-y-2" aria-live="polite">
        {placing && <Alert tone="info">Haz clic en el mapa donde quieras ubicar el nuevo punto. <button type="button" className="ml-2 underline" onClick={() => setPlacing(false)}>Cancelar</button></Alert>}
        {flash && <Alert tone="success">{flash}</Alert>}
      </div>
      <Card>
        <CardHeader title="Mapa" description="Haz clic en un marcador para editarlo." />
        <InfrastructureMap
          reloadKey={reloadKey}
          draft={editor?.mode === "create" ? [editor.lng, editor.lat] : null}
          onPoiClick={(poi) => { setPlacing(false); setEditor({ mode: "edit", poi }); }}
          onMapClick={placing ? (lng, lat) => { setPlacing(false); setEditor({ mode: "create", lng, lat }); } : undefined}
        />
      </Card>
      {editor && <PoiEditor editor={editor} onClose={() => setEditor(null)} onDone={done} />}
    </>
  );
}

function PoiEditor({ editor, onClose, onDone }: { editor: Editor; onClose: () => void; onDone: (msg: string) => void }) {
  const poi = editor.mode === "edit" ? editor.poi : null;
  const attrs = (poi?.properties.attributes ?? {}) as Record<string, unknown>;
  const cap = typeof attrs.capacity === "number" ? attrs.capacity : "";
  const { register, handleSubmit, formState: { errors } } = useForm<PoiFormInput>({
    resolver: zodResolver(poiFormSchema),
    defaultValues: {
      name: poi?.properties.name ?? "",
      category: poi?.properties.category ?? "BIKE_PARKING",
      description: poi?.properties.description ?? "",
      lng: poi ? poi.geometry.coordinates[0] : editor.mode === "create" ? editor.lng : 0,
      lat: poi ? poi.geometry.coordinates[1] : editor.mode === "create" ? editor.lat : 0,
      capacity: cap,
      // /map/pois solo devuelve POIs activos: un punto que se edita aquí está activo.
      is_active: true,
    },
  });
  const save = useMutation(async (v: PoiFormInput) => {
    const body = toBody(v, poi ? attrs : {});
    return poi ? api.admin.updatePoi(poi.id, { ...body, is_active: v.is_active }) : api.admin.createPoi(body);
  });
  const remove = useMutation(() => api.admin.deletePoi(poi!.id));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Modal open onClose={onClose} title={poi ? "Editar punto" : "Nuevo punto"}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          const res = await save.run(v);
          if (res.ok) onDone(poi ? "Punto actualizado." : "Punto creado.");
        })}
      >
        {(save.error || remove.error) && <Alert tone="error">{save.error ?? remove.error}</Alert>}
        <TextField label="Nombre" error={errors.name?.message} {...register("name")} />
        <SelectField label="Categoría" options={POI_CATEGORIES.map((c) => ({ value: c, label: POI_CATEGORY_LABELS[c] }))} error={errors.category?.message} {...register("category")} />
        <TextareaField label="Descripción (opcional)" error={errors.description?.message} {...register("description")} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Latitud" type="number" step="0.00001" inputMode="decimal" error={errors.lat?.message} {...register("lat")} />
          <TextField label="Longitud" type="number" step="0.00001" inputMode="decimal" error={errors.lng?.message} {...register("lng")} />
        </div>
        <TextField label="Capacidad (opcional)" type="number" min={0} inputMode="numeric" error={errors.capacity?.message} {...register("capacity")} />
        {poi && <CheckboxField label="Activo" description="Un punto inactivo deja de mostrarse en el mapa público." {...register("is_active")} />}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {poi ? (
            confirmDelete ? (
              <Button
                variant="danger"
                loading={remove.pending}
                onClick={async () => {
                  const res = await remove.run();
                  if (res.ok) onDone("Punto eliminado.");
                }}
              >
                Confirmar eliminación
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Eliminar</Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={save.pending}>Guardar</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
