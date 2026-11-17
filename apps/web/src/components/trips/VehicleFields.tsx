"use client";

import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type TransportMode, type VehicleType } from "@ecomove/shared";
import { api } from "@/lib/api";
import { useApiQuery } from "@/hooks/useApiQuery";
import { SelectField, TextField } from "@/components/ui/Fields";

export const VEHICLE_MODES: readonly TransportMode[] = ["CAR", "CARPOOL"];

export function usesVehicle(mode: TransportMode | "" | undefined | null): mode is "CAR" | "CARPOOL" {
  return mode === "CAR" || mode === "CARPOOL";
}

/** Ocupantes válidos según §4.3: 1..8; CARPOOL exige ≥ 2; tope del tipo de vehículo si el catálogo lo da. */
export function occupantsRange(mode: TransportMode, maxForVehicle?: number): { min: number; max: number } {
  return { min: mode === "CARPOOL" ? 2 : 1, max: Math.min(8, maxForVehicle ?? 8) };
}

export interface VehicleValue {
  vehicle_type: VehicleType | "";
  occupants: number;
}

/**
 * Tipo de auto y ocupantes (contrato 1.2 §4.3, observaciones O4/O5). Solo se muestran para CAR y
 * CARPOOL; el CO₂ lo calcula el backend (ADR-002). Vacío = preferencia del usuario o SEDAN.
 */
export function VehicleFields({ mode, value, onChange }: { mode: TransportMode; value: VehicleValue; onChange: (v: VehicleValue) => void }) {
  const catalog = useApiQuery("catalog|vehicle-types", () => api.catalog.vehicleTypes());
  if (!usesVehicle(mode)) return null;
  const active = catalog.data?.filter((v) => v.is_active).map((v) => v.code) ?? [...VEHICLE_TYPES];
  const max = catalog.data?.find((v) => v.code === value.vehicle_type)?.max_occupants;
  const range = occupantsRange(mode, max);
  const outOfRange = value.occupants < range.min || value.occupants > range.max || !Number.isInteger(value.occupants);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        label="Tipo de auto"
        hint="Cambia el factor de emisión del cálculo."
        value={value.vehicle_type}
        onChange={(e) => onChange({ ...value, vehicle_type: e.target.value as VehicleType | "" })}
        options={[{ value: "", label: "Mi auto habitual (o sedán)" }, ...active.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] }))]}
      />
      <TextField
        label="Personas en el auto (contándote)"
        type="number"
        inputMode="numeric"
        min={range.min}
        max={range.max}
        value={Number.isFinite(value.occupants) ? value.occupants : ""}
        onChange={(e) => onChange({ ...value, occupants: Number(e.target.value) })}
        hint={mode === "CARPOOL" ? "Auto compartido: mínimo 2 personas." : "Si vas acompañado, las emisiones se reparten."}
        error={outOfRange ? `Entre ${range.min} y ${range.max} personas` : undefined}
      />
    </div>
  );
}

export function vehicleValid(mode: TransportMode, v: VehicleValue): boolean {
  if (!usesVehicle(mode)) return true;
  const r = occupantsRange(mode);
  return Number.isInteger(v.occupants) && v.occupants >= r.min && v.occupants <= r.max;
}

/** Campos 1.2 para el cuerpo de estimate/create/update: null si el medio no usa vehículo. */
export function vehiclePayload(mode: TransportMode, v: VehicleValue): { vehicle_type: VehicleType | null; occupants: number | null } {
  if (!usesVehicle(mode)) return { vehicle_type: null, occupants: null };
  return { vehicle_type: v.vehicle_type || null, occupants: v.occupants };
}

export function defaultOccupants(mode: TransportMode): number {
  return mode === "CARPOOL" ? 2 : 1;
}
