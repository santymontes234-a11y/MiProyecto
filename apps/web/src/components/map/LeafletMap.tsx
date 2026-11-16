"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { map as mapTokens, modeColors, type BBox, type CyclewayFeature, type PoiFeature } from "@ecomove/shared";
import { formatDistance } from "@ecomove/shared";
import { useThemeColors } from "@/hooks/useColorScheme";
import { POI_CATEGORY_LABELS, POI_GLYPH, poiColor } from "./map-styles";

export interface LeafletMapProps {
  /** Texto accesible que describe el mapa. */
  label: string;
  pois?: PoiFeature[];
  cycleways?: CyclewayFeature[];
  height?: number;
  /** [lng, lat] como en GeoJSON. */
  center?: [number, number];
  zoom?: number;
  onBoundsChange?: (bbox: BBox) => void;
  onMapClick?: (lng: number, lat: number) => void;
  onPoiClick?: (poi: PoiFeature) => void;
  /** Marcador temporal (p. ej. al crear un POI), [lng, lat]. */
  draft?: [number, number] | null;
  /** Recorrido de un viaje (GeoJSON [lng, lat]); el mapa se ajusta a su extensión. */
  route?: [number, number][];
  routeColor?: string;
  /** Capas adicionales de react-leaflet (p. ej. features/analytics-map). */
  children?: React.ReactNode;
}

function FitRoute({ route }: { route: [number, number][] }) {
  const m = useMap();
  useEffect(() => {
    if (route.length < 2) return;
    m.fitBounds(L.latLngBounds(route.map(([lng, lat]) => [lat, lng] as [number, number])), { padding: [24, 24] });
  }, [m, route]);
  return null;
}

function round(n: number) {
  return Math.round(n * 1e5) / 1e5;
}

function Events({ onBoundsChange, onMapClick }: Pick<LeafletMapProps, "onBoundsChange" | "onMapClick">) {
  const m = useMap();
  useEffect(() => {
    if (!onBoundsChange) return;
    const b = m.getBounds();
    onBoundsChange([round(b.getWest()), round(b.getSouth()), round(b.getEast()), round(b.getNorth())]);
  }, [m, onBoundsChange]);
  useMapEvents({
    moveend(e) {
      if (!onBoundsChange) return;
      const b = e.target.getBounds() as L.LatLngBounds;
      onBoundsChange([round(b.getWest()), round(b.getSouth()), round(b.getEast()), round(b.getNorth())]);
    },
    click(e) {
      onMapClick?.(round(e.latlng.lng), round(e.latlng.lat));
    },
  });
  return null;
}

function glyphIcon(letter: string, color: string, ring: string, ink: string): L.DivIcon {
  // Contenido estático (letra fija + colores de tokens): sin datos del usuario en el HTML.
  const html = `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:${color};color:${ink};border:2px solid ${ring};font:700 12px/1 Inter,system-ui,sans-serif;box-shadow:0 1px 3px rgb(0 0 0 / .3)">${letter}</span>`;
  return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
}

export default function LeafletMap({ label, pois = [], cycleways = [], height = 460, center = mapTokens.defaultCenter, zoom = mapTokens.defaultZoom, onBoundsChange, onMapClick, onPoiClick, draft, route, routeColor, children }: LeafletMapProps) {
  const c = useThemeColors();
  return (
    <div role="region" aria-label={label} style={{ height }} className="overflow-hidden rounded-lg border border-line">
      <MapContainer center={[center[1], center[0]]} zoom={zoom} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution={mapTokens.osmAttribution} url={mapTokens.osmTileUrl} />
        <Events onBoundsChange={onBoundsChange} onMapClick={onMapClick} />
        {cycleways.map((cw) => (
          <Polyline
            key={cw.id}
            positions={cw.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{ color: modeColors.BICYCLE, weight: 4, dashArray: cw.properties.is_protected ? undefined : "6 6" }}
          >
            <Tooltip sticky>
              {cw.properties.name ?? "Ciclovía"} · {formatDistance(cw.properties.length_m)} · {cw.properties.is_protected ? "protegida" : "no protegida"}
            </Tooltip>
          </Polyline>
        ))}
        {pois.map((p) => {
          const [lng, lat] = p.geometry.coordinates;
          return (
            <Marker
              key={p.id}
              position={[lat, lng]}
              icon={glyphIcon(POI_GLYPH[p.properties.category], poiColor(p.properties.category, c), c.surface, c.onPrimary)}
              title={`${p.properties.name} (${POI_CATEGORY_LABELS[p.properties.category]})`}
              alt={p.properties.name}
              eventHandlers={onPoiClick ? { click: () => onPoiClick(p) } : undefined}
            >
              <Tooltip>
                <strong>{p.properties.name}</strong>
                <br />
                {POI_CATEGORY_LABELS[p.properties.category]}
              </Tooltip>
            </Marker>
          );
        })}
        {route && route.length > 1 && (
          <>
            <FitRoute route={route} />
            <Polyline positions={route.map(([lng, lat]) => [lat, lng] as [number, number])} pathOptions={{ color: routeColor ?? c.primary, weight: 5, opacity: 0.9 }} />
            <Marker position={[route[0]![1], route[0]![0]]} icon={glyphIcon("A", c.primaryStrong, c.surface, c.onPrimary)} title="Inicio del viaje" />
            <Marker position={[route[route.length - 1]![1], route[route.length - 1]![0]]} icon={glyphIcon("B", c.secondary, c.surface, c.onPrimary)} title="Fin del viaje" />
          </>
        )}
        {children}
        {draft && <Marker position={[draft[1], draft[0]]} icon={glyphIcon("+", c.danger, c.surface, c.onPrimary)} title="Nueva ubicación" />}
      </MapContainer>
    </div>
  );
}
