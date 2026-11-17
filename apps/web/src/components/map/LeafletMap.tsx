"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { map as mapTokens, modeColors, type BBox, type CyclewayFeature, type PoiFeature } from "@ecomove/shared";
import { formatDistance } from "@ecomove/shared";
import { useColorScheme, useThemeColors } from "@/hooks/useColorScheme";
import { BASEMAPS, BASEMAP_ATTRIBUTION, BASEMAP_MAX_ZOOM, BASEMAP_SUBDOMAINS } from "./tiles";
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
  /** Punto al que volar (p. ej. un lugar elegido en el buscador), [lng, lat]. */
  focus?: [number, number] | null;
  /** Marcadores con letra (origen/destino, lugar buscado). */
  markers?: { position: [number, number]; letter: string; title: string; tone?: "primary" | "secondary" | "danger" }[];
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

function FlyTo({ focus }: { focus: [number, number] }) {
  const m = useMap();
  useEffect(() => {
    m.flyTo([focus[1], focus[0]], Math.max(m.getZoom(), 16), { duration: 0.8 });
  }, [m, focus]);
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

/** Marcador tipo «pin» con letra (no depende solo del color). Contenido estático: letra fija + tokens. */
function pinIcon(letter: string, color: string, ring: string, ink: string): L.DivIcon {
  const html = `<span class="ecomove-pin" style="position:relative;display:block;width:30px;height:40px;filter:drop-shadow(0 2px 3px rgb(0 0 0 / .35))"><svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C15 39 28 24.5 28 14.5A13 13 0 0 0 2 14.5C2 24.5 15 39 15 39Z" fill="${color}" stroke="${ring}" stroke-width="2"/></svg><span style="position:absolute;top:6px;left:0;width:30px;text-align:center;color:${ink};font:700 13px/17px Inter,system-ui,sans-serif">${letter}</span></span>`;
  return L.divIcon({ html, className: "", iconSize: [30, 40], iconAnchor: [15, 39], tooltipAnchor: [0, -32] });
}

/** Punto de inicio/fin de ruta: círculo con anillo blanco, como en los navegadores. */
function endpointIcon(letter: string, color: string, ring: string, ink: string): L.DivIcon {
  const html = `<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:${color};color:${ink};border:3px solid ${ring};font:700 12px/1 Inter,system-ui,sans-serif;box-shadow:0 2px 6px rgb(0 0 0 / .35)">${letter}</span>`;
  return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
}

export default function LeafletMap({ label, pois = [], cycleways = [], height = 460, center = mapTokens.defaultCenter, zoom = mapTokens.defaultZoom, onBoundsChange, onMapClick, onPoiClick, draft, route, routeColor, focus, markers = [], children }: LeafletMapProps) {
  const c = useThemeColors();
  const scheme = useColorScheme();
  return (
    <div role="region" aria-label={label} style={{ height }} className="overflow-hidden rounded-lg border border-line">
      <MapContainer center={[center[1], center[0]]} zoom={zoom} scrollWheelZoom={false} zoomControl={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer key={scheme} attribution={BASEMAP_ATTRIBUTION} url={BASEMAPS[scheme]} subdomains={BASEMAP_SUBDOMAINS} maxZoom={BASEMAP_MAX_ZOOM} detectRetina />
        <ZoomControl position="bottomright" />
        <ScaleControl position="bottomleft" imperial={false} />
        <Events onBoundsChange={onBoundsChange} onMapClick={onMapClick} />
        {cycleways.map((cw) => (
          <Polyline
            key={cw.id}
            positions={cw.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{ color: modeColors.BICYCLE, weight: 4, opacity: 0.9, lineCap: "round", lineJoin: "round", dashArray: cw.properties.is_protected ? undefined : "2 8" }}
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
              icon={pinIcon(POI_GLYPH[p.properties.category], poiColor(p.properties.category, c), c.surface, c.onPrimary)}
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
            {/* Contorno + trazo: la ruta destaca sobre cualquier fondo, como en los navegadores. */}
            <Polyline positions={route.map(([lng, lat]) => [lat, lng] as [number, number])} pathOptions={{ color: c.surface, weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" }} interactive={false} />
            <Polyline positions={route.map(([lng, lat]) => [lat, lng] as [number, number])} pathOptions={{ color: routeColor ?? c.primary, weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" }} />
            <Marker position={[route[0]![1], route[0]![0]]} icon={endpointIcon("A", c.primaryStrong, c.surface, c.onPrimary)} title="Inicio del viaje" />
            <Marker position={[route[route.length - 1]![1], route[route.length - 1]![0]]} icon={endpointIcon("B", c.secondary, c.surface, c.onPrimary)} title="Fin del viaje" />
          </>
        )}
        {focus && <FlyTo focus={focus} />}
        {markers.map((mk, i) => (
          <Marker
            key={`${mk.letter}-${i}`}
            position={[mk.position[1], mk.position[0]]}
            icon={pinIcon(mk.letter, mk.tone === "secondary" ? c.secondary : mk.tone === "danger" ? c.danger : c.primaryStrong, c.surface, c.onPrimary)}
            title={mk.title}
            alt={mk.title}
          >
            <Tooltip>{mk.title}</Tooltip>
          </Marker>
        ))}
        {children}
        {draft && <Marker position={[draft[1], draft[0]]} icon={pinIcon("+", c.danger, c.surface, c.onPrimary)} title="Nueva ubicación" />}
      </MapContainer>
    </div>
  );
}
