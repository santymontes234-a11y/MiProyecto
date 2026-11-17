"use client";

import { useCallback, useEffect, useState } from "react";
import { POI_CATEGORIES, type BBox, type Place, type PoiCategory, type PoiFeature } from "@ecomove/shared";
import { api } from "@/lib/api";
import { bboxTooLarge } from "@/lib/geo";
import { useApiQuery, errorMessage } from "@/hooks/useApiQuery";
import { Alert } from "@/components/ui/StateViews";
import { MapLegend, MapView } from "./MapView";
import { POI_CATEGORY_LABELS } from "./map-styles";
import { PlaceSearch } from "./PlaceSearch";

/**
 * Mapa de infraestructura (contrato §5): POIs y ciclovías del área visible. Las consultas se
 * hacen por bbox (máx. 0.5°×0.5°, si no la API responde BBOX_TOO_LARGE).
 */
export function InfrastructureMap({ height = 520, onPoiClick, onMapClick, draft, reloadKey = 0, searchable = true, onPoisChange }: {
  height?: number;
  onPoiClick?: (p: PoiFeature) => void;
  onMapClick?: (lng: number, lat: number) => void;
  draft?: [number, number] | null;
  reloadKey?: number;
  /** Muestra el buscador de lugares (contrato 1.2 §12.1). */
  searchable?: boolean;
  /** Recibe los POIs del área visible (p. ej. para la tabla del panel admin). */
  onPoisChange?: (pois: PoiFeature[] | null) => void;
}) {
  const [place, setPlace] = useState<Place | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [categories, setCategories] = useState<PoiCategory[]>([...POI_CATEGORIES]);
  const [showCycleways, setShowCycleways] = useState(true);
  const onBounds = useCallback((b: BBox) => setBbox(b), []);

  const tooLarge = !!bbox && bboxTooLarge(bbox);
  const key = bbox && !tooLarge ? `${bbox.join(",")}|${categories.join(",")}|${reloadKey}` : null;
  const pois = useApiQuery(key, () => api.map.pois({ bbox: bbox!, category: categories, limit: 500 }));
  const cycleways = useApiQuery(key && showCycleways ? `${bbox!.join(",")}|${reloadKey}` : null, () => api.map.cycleways(bbox!));

  const visible = tooLarge ? null : pois.data?.features ?? null;
  useEffect(() => {
    onPoisChange?.(visible);
  }, [visible, onPoisChange]);

  function toggle(c: PoiCategory) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <div>
      {searchable && (
        <PlaceSearch label="Buscar un lugar" placeholder="Ej. UPQ, Centro Histórico, Corregidora" onSelect={setPlace} className="mb-3 max-w-xl" />
      )}
      <fieldset className="mb-3 flex flex-wrap gap-2">
        <legend className="sr-only">Capas del mapa</legend>
        {POI_CATEGORIES.map((c) => (
          <label key={c} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-panel px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="checkbox" className="accent-brand" checked={categories.includes(c)} onChange={() => toggle(c)} />
            {POI_CATEGORY_LABELS[c]}
          </label>
        ))}
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-panel px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="checkbox" className="accent-brand" checked={showCycleways} onChange={(e) => setShowCycleways(e.target.checked)} />
          Ciclovías
        </label>
      </fieldset>

      <div className="mb-3 space-y-2" aria-live="polite">
        {tooLarge && <Alert tone="info">Acerca el mapa para ver la infraestructura (área máxima de consulta: 0.5° × 0.5°).</Alert>}
        {(pois.error || cycleways.error) && <Alert tone="error">{errorMessage(pois.error ?? cycleways.error)}</Alert>}
        {(pois.loading || cycleways.loading) && <p className="text-xs text-ink-muted">Cargando capas…</p>}
        {!pois.loading && pois.data && pois.data.features.length === 0 && !tooLarge && <p className="text-xs text-ink-muted">No hay puntos de esta categoría en el área visible.</p>}
      </div>

      <MapView
        label="Mapa de infraestructura de movilidad sostenible en Querétaro"
        height={height}
        pois={tooLarge ? [] : pois.data?.features ?? []}
        cycleways={tooLarge || !showCycleways ? [] : cycleways.data?.features ?? []}
        onBoundsChange={onBounds}
        onPoiClick={onPoiClick}
        onMapClick={onMapClick}
        draft={draft}
        focus={place?.position ?? null}
        markers={place ? [{ position: place.position, letter: "•", title: place.label, tone: "danger" }] : []}
      />
      <MapLegend />
    </div>
  );
}
