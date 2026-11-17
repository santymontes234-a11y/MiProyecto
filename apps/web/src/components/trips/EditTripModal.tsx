"use client";

import { useEffect, useState } from "react";
import { MODE_LABELS, TRANSPORT_MODES, type TransportMode, type Trip, type TripStatus, type TripUpdate } from "@ecomove/shared";
import { api } from "@/lib/api";
import { dateTimeLocalToIso, toDateTimeLocal } from "@/lib/format";
import { tripErrorMessage } from "@/lib/trip-errors";
import { Modal } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/StateViews";
import { VehicleFields, defaultOccupants, usesVehicle, vehiclePayload, vehicleValid, type VehicleValue } from "./VehicleFields";

/**
 * Edición de un viaje propio (`PATCH /trips/{id}`, contrato 1.1 §4 y 1.2 §4.3). Solo se envían
 * los campos cambiados; la API recalcula CO₂ y puntos y aplica las validaciones de §4.1.
 */
export function EditTripModal({ trip, open, onClose, onSaved }: { trip: Trip; open: boolean; onClose: () => void; onSaved: (t: Trip) => void }) {
  const [mode, setMode] = useState<TransportMode>(trip.mode);
  const [status, setStatus] = useState<TripStatus>(trip.status);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [vehicle, setVehicle] = useState<VehicleValue>({ vehicle_type: "", occupants: 1 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(trip.mode);
    setStatus(trip.status);
    setStart(toDateTimeLocal(new Date(trip.started_at)));
    setEnd(toDateTimeLocal(new Date(trip.ended_at)));
    setVehicle({ vehicle_type: trip.vehicle_type ?? "", occupants: trip.occupants ?? defaultOccupants(trip.mode) });
    setError(null);
  }, [open, trip]);

  const planned = trip.source === "PLANNED";
  const startIso = dateTimeLocalToIso(start);
  const endIso = dateTimeLocalToIso(end);
  const rangeError = startIso && endIso && startIso >= endIso ? "La llegada debe ser posterior a la salida" : undefined;
  const valid = !!startIso && !!endIso && !rangeError && vehicleValid(mode, vehicle);

  async function submit() {
    if (!valid) return;
    const body: TripUpdate = {};
    if (mode !== trip.mode) body.mode = mode;
    if (status !== trip.status) body.status = status;
    if (startIso && new Date(startIso).getTime() !== new Date(trip.started_at).getTime()) body.started_at = startIso;
    if (endIso && new Date(endIso).getTime() !== new Date(trip.ended_at).getTime()) body.ended_at = endIso;
    if (usesVehicle(mode)) {
      const v = vehiclePayload(mode, vehicle);
      if (v.vehicle_type !== trip.vehicle_type || mode !== trip.mode) body.vehicle_type = v.vehicle_type;
      if (v.occupants !== trip.occupants || mode !== trip.mode) body.occupants = v.occupants;
    }
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.trips.update(trip.id, body));
    } catch (e) {
      setError(tripErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar viaje">
      <div className="space-y-4">
        <SelectField
          label="Medio de transporte"
          value={mode}
          disabled={planned}
          hint={planned ? "La ruta se calculó para este medio; para cambiarlo, registra el viaje de nuevo." : undefined}
          onChange={(e) => {
            const m = e.target.value as TransportMode;
            setMode(m);
            setVehicle((v) => ({ ...v, occupants: Math.max(v.occupants, defaultOccupants(m)) }));
          }}
          options={TRANSPORT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
        />
        <VehicleFields mode={mode} value={vehicle} onChange={setVehicle} />
        <SelectField
          label="Estado"
          value={status}
          onChange={(e) => setStatus(e.target.value as TripStatus)}
          options={[{ value: "COMPLETED", label: "Completado" }, { value: "CANCELLED", label: "Cancelado (0 puntos)" }]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Salida" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} error={!startIso ? "Fecha no válida" : undefined} />
          <TextField label="Llegada" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} error={!endIso ? "Fecha no válida" : rangeError} />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button loading={saving} disabled={!valid} onClick={submit}>Guardar cambios</Button>
      </div>
    </Modal>
  );
}
