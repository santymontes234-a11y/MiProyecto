"use client";

import { Bike, BusFront, PlugZap, SquareParking, Wrench, Route } from "lucide-react";
import { POI_CATEGORIES, POI_CATEGORY_LABELS, formatDistance, map as mapTokens, type BBox, type PoiCategory } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { StatTile } from "@/components/ui/StatTile";
import { Alert } from "@/components/ui/StateViews";

/** Área de referencia: 0.5° × 0.5° centrada en Querétaro (máximo permitido por el contrato). */
const [cLng, cLat] = mapTokens.defaultCenter;
export const METRO_BBOX: BBox = [cLng - 0.25, cLat - 0.25, cLng + 0.25, cLat + 0.25];

const ICONS: Record<PoiCategory, typeof Bike> = {
  BIKE_PARKING: SquareParking,
  BIKE_SHARING: Bike,
  BUS_STOP: BusFront,
  EV_CHARGER: PlugZap,
  REPAIR_STATION: Wrench,
};

/**
 * Indicadores de infraestructura a partir de los endpoints públicos de mapa (conteo y suma
 * de longitudes ya calculadas por la API; aquí solo se agregan para mostrarlas).
 */
export function InfrastructureIndicators() {
  const pois = useApiQuery("infra|pois", () => api.map.pois({ bbox: METRO_BBOX, limit: 500 }));
  const cw = useApiQuery("infra|cw", () => api.map.cycleways(METRO_BBOX));
  const counts = new Map<PoiCategory, number>();
  for (const f of pois.data?.features ?? []) counts.set(f.properties.category, (counts.get(f.properties.category) ?? 0) + 1);
  const total = cw.data?.features.reduce((a, f) => a + f.properties.length_m, 0) ?? 0;
  const prot = cw.data?.features.filter((f) => f.properties.is_protected).reduce((a, f) => a + f.properties.length_m, 0) ?? 0;
  const capped = (pois.data?.features.length ?? 0) >= 500;
  const err = pois.error ?? cw.error;

  return (
    <div className="space-y-3">
      {err && <Alert tone="error">{errorMessage(err)}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile label="Red de ciclovías" value={cw.loading ? "—" : formatDistance(total)} hint={cw.loading ? undefined : `${formatDistance(prot)} protegidas`} icon={<Route className="size-5" />} />
        {POI_CATEGORIES.map((c) => {
          const Icon = ICONS[c];
          return <StatTile key={c} label={POI_CATEGORY_LABELS[c]} value={pois.loading ? "—" : `${formatNumber(counts.get(c) ?? 0)}${capped ? "+" : ""}`} icon={<Icon className="size-5" />} accent="blue" />;
        })}
      </div>
      <p className="text-xs text-ink-muted">Zona metropolitana (radio aprox. de 25 km alrededor del centro). {capped && "Se alcanzó el límite de 500 puntos por consulta: las cifras son mínimas."}</p>
    </div>
  );
}
