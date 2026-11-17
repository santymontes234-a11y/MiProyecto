import { VEHICLE_TYPES, type Preferences, type TransportMode, type VehicleType, type VehicleTypeInfo } from '@ecomove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

/** O4/O5 (contrato §4.3): solo CAR y CARPOOL llevan tipo de vehículo y ocupantes. */
export const VEHICLE_MODES = ['CAR', 'CARPOOL'] as const satisfies readonly TransportMode[];
export const usesVehicle = (mode: TransportMode | null | undefined): boolean => mode === 'CAR' || mode === 'CARPOOL';

export const MAX_OCCUPANTS = 8;
export const minOccupants = (mode: TransportMode): number => (mode === 'CARPOOL' ? 2 : 1);
export const defaultOccupants = (mode: TransportMode): number => (mode === 'CARPOOL' ? 2 : 1);
export const DEFAULT_VEHICLE: VehicleType = 'SEDAN';

export interface VehicleChoice {
  vehicle_type: VehicleType;
  occupants: number;
}

/** Ajusta los ocupantes al rango válido del medio y del tipo de vehículo. */
export function clampOccupants(mode: TransportMode, n: number, maxForType = MAX_OCCUPANTS): number {
  const max = Math.min(MAX_OCCUPANTS, Math.max(minOccupants(mode), maxForType));
  return Math.max(minOccupants(mode), Math.min(max, Math.round(n)));
}

const FALLBACK_TYPES: VehicleTypeInfo[] = VEHICLE_TYPES.map((code) => ({ code, max_occupants: code === 'MINIVAN' ? 8 : 5, is_active: true }));

/** Catálogo público /catalog/vehicle-types; si aún no existe, usa el enum del contrato. */
export function useVehicleTypes() {
  const q = useQuery({
    queryKey: ['catalog', 'vehicle-types'],
    queryFn: () => api.catalog.vehicleTypes(),
    staleTime: 60 * 60_000,
    retry: false,
  });
  const types = (q.data?.length ? q.data : FALLBACK_TYPES).filter((t) => t.is_active);
  return { ...q, types };
}

export function usePreferences() {
  return useQuery({ queryKey: ['users', 'me', 'preferences'], queryFn: () => api.users.preferences(), staleTime: 5 * 60_000, retry: false });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Preferences) => api.users.updatePreferences(body),
    onSuccess: (prefs) => qc.setQueryData(['users', 'me', 'preferences'], prefs),
  });
}
