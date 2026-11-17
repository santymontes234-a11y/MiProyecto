"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Leaf, MapPinned, Timer, Wind } from "lucide-react";
import {
  MODE_LABELS,
  TRANSPORT_MODES,
  VEHICLE_TYPE_LABELS,
  formatCo2,
  formatDistance,
  formatDuration,
  modeColors,
  type Place,
  type Position,
  type RouteResponse,
  type TransportMode,
  type TripEstimate,
} from "@ecomove/shared";
import { api } from "@/lib/api";
import { dateTimeLocalToIso, toDateTimeLocal } from "@/lib/format";
import { tripErrorMessage } from "@/lib/trip-errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/StateViews";
import { StatTile } from "@/components/ui/StatTile";
import { Segmented } from "@/components/ui/Segmented";
import { MapView } from "@/components/map/MapView";
import { PlaceSearch } from "@/components/map/PlaceSearch";
import { VehicleFields, defaultOccupants, usesVehicle, vehiclePayload, vehicleValid, type VehicleValue } from "@/components/trips/VehicleFields";

interface Point {
  position: Position;
  name: string;
}

type Target = "origin" | "destination";

/**
 * Planear y registrar un viaje (contrato §12 `/routes` + §4 `/trips`, `source = PLANNED`).
 * Origen y destino por nombre (§12.1 `/geocode`) o tocando el mapa. El CO₂ y los puntos los calcula
 * la API (ADR-002): aquí solo se muestran.
 */
export default function NewTripPage() {
  const router = useRouter();
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [target, setTarget] = useState<Target>("origin");
  const [mode, setMode] = useState<TransportMode>("BICYCLE");
  const [vehicle, setVehicle] = useState<VehicleValue>({ vehicle_type: "", occupants: 1 });
  const [startedAt, setStartedAt] = useState(() => toDateTimeLocal(new Date(Date.now() - 60 * 60 * 1000)));
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [estimate, setEstimate] = useState<TripEstimate | null>(null);
  const [busy, setBusy] = useState<"route" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Position | null>(null);

  function invalidate() {
    setRoute(null);
    setEstimate(null);
    setError(null);
  }

  function setPoint(t: Target, p: Point) {
    (t === "origin" ? setOrigin : setDestination)(p);
    setFocus(p.position);
    if (t === "origin" && !destination) setTarget("destination");
    invalidate();
  }

  function onMapClick(lng: number, lat: number) {
    setPoint(target, { position: [lng, lat], name: `Punto en el mapa (${lat.toFixed(4)}, ${lng.toFixed(4)})` });
  }

  function changeMode(m: TransportMode) {
    setMode(m);
    setVehicle((v) => ({ ...v, occupants: Math.max(v.occupants, defaultOccupants(m)) }));
    invalidate();
  }

  const startIso = dateTimeLocalToIso(startedAt);
  const futureStart = !!startIso && new Date(startIso).getTime() > Date.now();
  const canCalculate = !!origin && !!destination && vehicleValid(mode, vehicle);

  async function calculate() {
    if (!origin || !destination) return;
    setBusy("route");
    setError(null);
    try {
      const r = await api.routes.get({ origin: origin.position, destination: destination.position, mode });
      const est = await api.trips.estimate({ mode, route: r.route, ...vehiclePayload(mode, vehicle) });
      setRoute(r);
      setEstimate(est);
    } catch (e) {
      setRoute(null);
      setEstimate(null);
      setError(tripErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!route || !startIso) return;
    const start = new Date(startIso);
    const end = new Date(start.getTime() + route.duration_s * 1000);
    if (end.getTime() > Date.now()) {
      setError("El viaje terminaría en el futuro. Elige una hora de salida anterior.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const trip = await api.trips.create({
        client_trip_id: crypto.randomUUID(),
        mode,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        route: route.route,
        source: "PLANNED",
        route_token: route.route_token,
        ...vehiclePayload(mode, vehicle),
      });
      router.push(`/app/viajes/${encodeURIComponent(trip.id)}?created=1`);
    } catch (e) {
      setError(tripErrorMessage(e));
      setBusy(null);
    }
  }

  const markers = [
    ...(origin ? [{ position: origin.position as [number, number], letter: "A", title: `Origen: ${origin.name}`, tone: "primary" as const }] : []),
    ...(destination ? [{ position: destination.position as [number, number], letter: "B", title: `Destino: ${destination.name}`, tone: "secondary" as const }] : []),
  ];

  return (
    <>
      <Link href="/app/viajes" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-strong">
        <ArrowLeft className="size-4" aria-hidden="true" /> Historial
      </Link>
      <PageHeader title="Registrar un viaje" description="Busca el origen y el destino por nombre o tócalos en el mapa. Calculamos la ruta y el CO₂ que evitas." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader title="Datos del viaje" />
          <div className="space-y-4">
            <PlaceSearch label="Origen" placeholder="Ej. UPQ" value={origin?.name} near={destination?.position} onSelect={(p: Place) => setPoint("origin", { position: p.position, name: p.name })} />
            <PlaceSearch label="Destino" placeholder="Ej. Corregidora" value={destination?.name} near={origin?.position} onSelect={(p: Place) => setPoint("destination", { position: p.position, name: p.name })} />
            <Segmented
              label="Al tocar el mapa se fija"
              value={target}
              onChange={setTarget}
              options={[{ value: "origin", label: "Origen (A)" }, { value: "destination", label: "Destino (B)" }]}
            />
            <SelectField
              label="Medio de transporte"
              value={mode}
              onChange={(e) => changeMode(e.target.value as TransportMode)}
              options={TRANSPORT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
            />
            <VehicleFields mode={mode} value={vehicle} onChange={(v) => { setVehicle(v); invalidate(); }} />
            <TextField
              label="Hora de salida"
              type="datetime-local"
              value={startedAt}
              max={toDateTimeLocal(new Date())}
              onChange={(e) => setStartedAt(e.target.value)}
              error={!startIso ? "Fecha no válida" : futureStart ? "No puede estar en el futuro" : undefined}
              hint="La hora de llegada se calcula con la duración de la ruta."
            />
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={calculate} loading={busy === "route"} disabled={!canCalculate || busy !== null}>
                Calcular ruta e impacto
              </Button>
              <Button onClick={save} loading={busy === "save"} disabled={!route || !startIso || futureStart || busy !== null}>
                Guardar viaje
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Mapa" description={target === "origin" ? "Toca el mapa para fijar el origen (A)." : "Toca el mapa para fijar el destino (B)."} />
            <MapView
              label="Mapa para elegir origen y destino del viaje"
              height={440}
              onMapClick={onMapClick}
              markers={route ? [] : markers}
              route={route?.route.coordinates as [number, number][] | undefined}
              routeColor={modeColors[mode]}
              focus={route ? null : focus}
            />
          </Card>

          {estimate && route && (
            <Card>
              <CardHeader
                title="Impacto estimado"
                description={
                  usesVehicle(mode)
                    ? `${MODE_LABELS[mode]} · ${estimate.vehicle_type ? VEHICLE_TYPE_LABELS[estimate.vehicle_type] : "auto"} · ${estimate.occupants ?? vehicle.occupants} ${(estimate.occupants ?? vehicle.occupants) === 1 ? "persona" : "personas"}`
                    : `${MODE_LABELS[mode]} frente a hacer el mismo trayecto en auto`
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <StatTile
                  label={usesVehicle(mode) ? "Ahorro frente a ir solo" : "CO₂ evitado"}
                  value={formatCo2(estimate.co2_saved_g)}
                  hint={usesVehicle(mode) && (estimate.occupants ?? 1) <= 1 ? "Comparte el auto para ahorrar CO₂." : `+${estimate.points_estimate} puntos`}
                  icon={<Leaf className="size-5" />}
                />
                <StatTile label={usesVehicle(mode) ? "CO₂ que te corresponde" : "CO₂ emitido"} value={formatCo2(estimate.co2_emitted_g)} hint={`Factor: ${estimate.emission_factor_g_per_km} g/km`} icon={<Wind className="size-5" />} accent="yellow" />
                <StatTile label="Distancia" value={formatDistance(route.distance_m)} icon={<MapPinned className="size-5" />} accent="blue" />
                <StatTile label="Duración estimada" value={formatDuration(route.duration_s)} hint={`Ruta: ${route.provider}`} icon={<Timer className="size-5" />} accent="teal" />
              </div>
              {usesVehicle(mode) && (estimate.occupants ?? 1) > 1 && (
                <p className="mt-4 text-sm text-ink-muted">
                  Ir solo emitiría {formatCo2(estimate.co2_emitted_g + estimate.co2_saved_g)}; al compartir entre {estimate.occupants} personas te corresponden {formatCo2(estimate.co2_emitted_g)}.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
