"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GeoJSON } from "react-leaflet";
import { ZONE_KINDS, type ZoneFeature, type ZoneKind } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { ZONE_KIND_LABELS } from "@/lib/labels";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { useThemeColors } from "@/hooks/useColorScheme";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FilterSelect, SelectField, TextField, TextareaField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/StateViews";
import { Badge } from "@/components/ui/Badge";
import { MapView } from "@/components/map/MapView";

const geometrySchema = z.string().refine((s) => {
  try {
    const g = JSON.parse(s) as { type?: string; coordinates?: unknown };
    return (g.type === "Polygon" || g.type === "MultiPolygon") && Array.isArray(g.coordinates);
  } catch {
    return false;
  }
}, "Pega un GeoJSON de tipo Polygon o MultiPolygon (coordenadas [lng, lat])");

const createSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/, "2–32 caracteres: A-Z, 0-9, _ o -"),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ZONE_KINDS),
  source: z.string().trim().min(2, "Indica la fuente (p. ej. INEGI-MGE-2020)").max(80).refine((s) => s.toUpperCase() !== "DEMO", "La fuente DEMO no se acepta"),
  geometry: geometrySchema,
});
type ZoneInput = z.infer<typeof createSchema>;

type Editor = { mode: "create" } | { mode: "edit"; zone: ZoneFeature };

export default function ZonesPage() {
  const c = useThemeColors();
  const [kind, setKind] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const zones = useApiQuery(`zones|${kind}`, () => api.catalog.zones({ kind: (kind || undefined) as ZoneKind | undefined }));
  const del = useMutation((id: string) => api.admin.deleteZone(id));
  const features = zones.data?.features ?? [];

  const columns: Column<ZoneFeature>[] = [
    { key: "code", header: "Código", cell: (z) => <code className="text-xs">{z.properties.code}</code> },
    { key: "name", header: "Nombre", cell: (z) => <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setSelected(z.id)}>{z.properties.name}</button> },
    { key: "kind", header: "Tipo", cell: (z) => <Badge tone="blue">{ZONE_KIND_LABELS[z.properties.kind]}</Badge> },
    { key: "src", header: "Fuente", cell: (z) => z.properties.source },
    { key: "area", header: "Área", align: "right", cell: (z) => `${formatNumber(Math.round(z.properties.area_km2 * 100) / 100)} km²` },
    {
      key: "act",
      header: "Acciones",
      align: "right",
      cell: (z) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="secondary" onClick={() => setEditor({ mode: "edit", zone: z })}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={async () => { if (window.confirm(`¿Eliminar la zona ${z.properties.name}? Se borra de forma definitiva.`)) { const r = await del.run(z.id); if (r.ok) { setFlash("Zona eliminada."); zones.refetch(); } } }}>Eliminar</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Zonas" description="Zonas de movilidad (colonias, AGEB, municipios…) usadas por la analítica." actions={<Button onClick={() => setEditor({ mode: "create" })}>Nueva zona</Button>} />
      {(flash || del.error) && <div className="mb-4"><Alert tone={del.error ? "error" : "success"}>{del.error ?? flash}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="mb-4"><FilterSelect label="Tipo" value={kind} onChange={setKind} options={[{ value: "", label: "Todos" }, ...ZONE_KINDS.map((k) => ({ value: k, label: ZONE_KIND_LABELS[k] }))]} /></div>
          <DataTable caption="Zonas" columns={columns} rows={zones.data ? features : undefined} rowKey={(z) => z.id} loading={zones.loading} error={zones.error ? errorMessage(zones.error) : null} onRetry={zones.refetch} emptyTitle="No hay zonas registradas" />
        </Card>
        <Card>
          <CardHeader title="Mapa" description="La zona seleccionada se resalta." />
          <MapView label="Mapa de zonas" height={460} zoom={11}>
            {features.map((f) => (
              <GeoJSON
                key={`${f.id}-${selected === f.id}`}
                data={f}
                style={{ color: selected === f.id ? c.secondary : c.primaryStrong, weight: selected === f.id ? 3 : 1.5, fillColor: c.primary, fillOpacity: selected === f.id ? 0.3 : 0.08 }}
                eventHandlers={{ click: () => setSelected(f.id) }}
              />
            ))}
          </MapView>
        </Card>
      </div>
      {editor && <ZoneEditor editor={editor} onClose={() => setEditor(null)} onDone={(m) => { setEditor(null); setFlash(m); zones.refetch(); }} />}
    </>
  );
}

function ZoneEditor({ editor, onClose, onDone }: { editor: Editor; onClose: () => void; onDone: (msg: string) => void }) {
  const zone = editor.mode === "edit" ? editor.zone : null;
  const { register, handleSubmit, formState: { errors } } = useForm<ZoneInput>({
    resolver: zodResolver(createSchema),
    defaultValues: zone
      ? { code: zone.properties.code, name: zone.properties.name, kind: zone.properties.kind, source: zone.properties.source, geometry: JSON.stringify(zone.geometry) }
      : { kind: "colonia", geometry: "" },
  });
  const save = useMutation(async (v: ZoneInput) => {
    const geometry = JSON.parse(v.geometry) as Parameters<typeof api.admin.createZone>[0]["geometry"];
    return zone ? api.admin.updateZone(zone.id, { name: v.name, kind: v.kind, source: v.source, geometry }) : api.admin.createZone({ code: v.code, name: v.name, kind: v.kind, source: v.source, geometry });
  });
  return (
    <Modal open onClose={onClose} title={zone ? `Editar ${zone.properties.name}` : "Nueva zona"}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { if ((await save.run(v)).ok) onDone(zone ? "Zona actualizada." : "Zona creada."); })}>
        {save.error && <Alert tone="error">{save.error}</Alert>}
        <TextField label="Código" disabled={!!zone} hint={zone ? "El código es inmutable." : undefined} error={errors.code?.message} {...register("code")} />
        <TextField label="Nombre" error={errors.name?.message} {...register("name")} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Tipo" options={ZONE_KINDS.map((k) => ({ value: k, label: ZONE_KIND_LABELS[k] }))} {...register("kind")} />
          <TextField label="Fuente" placeholder="INEGI-MGE-2020" error={errors.source?.message} {...register("source")} />
        </div>
        <TextareaField label="Geometría (GeoJSON)" className="min-h-32 font-mono text-xs" hint='Ej.: {"type":"Polygon","coordinates":[[[-100.40,20.59],[-100.38,20.59],[-100.38,20.60],[-100.40,20.59]]]}' error={errors.geometry?.message} {...register("geometry")} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.pending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
