import { ApiError, type LineStringGeometry, type Paginated, type Position, type TransportMode, type TripEstimate, type TripEstimateRequest, type TripSummary, type TripUpdate } from '@ecomove/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { getErrorMessage, isNetworkError } from '@/lib/errors';
import { queryKeys } from '@/lib/query-client';
import { usesVehicle, type VehicleChoice } from './vehicle';

const PAGE_SIZE = 20;

export function useTripsInfinite(mode?: TransportMode) {
  return useInfiniteQuery({
    queryKey: queryKeys.trips(mode),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.trips.list({ page: pageParam, page_size: PAGE_SIZE, mode }),
    getNextPageParam: (last: Paginated<TripSummary>) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
}

export function useRecentTrips(limit = 3) {
  return useQuery({
    queryKey: [...queryKeys.trips(), 'recent', limit],
    queryFn: () => api.trips.list({ page: 1, page_size: limit }),
  });
}

export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.trip(id ?? ''),
    queryFn: () => api.trips.get(id ?? ''),
    enabled: !!id,
  });
}

/** PATCH /trips/{id}: el backend recalcula distancia, CO₂ y puntos. */
export function useUpdateTrip(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TripUpdate) => api.trips.update(id, body),
    onSuccess: (trip) => {
      qc.setQueryData(queryKeys.trip(id), trip);
      void qc.invalidateQueries({ queryKey: ['trips', 'list'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['gamification'] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.trips.remove(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: queryKeys.trip(id) });
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/**
 * Previsualización de CO₂ y puntos (ADR-002: el cliente no calcula).
 * - Medios sin vehículo: POST /trips/estimate/batch; si el backend responde 404 (lote aún no publicado),
 *   respaldo con POST /trips/estimate por cada medio (O3).
 * - CAR/CARPOOL con vehículo elegido: POST /trips/estimate con `vehicle_type` y `occupants` (§4.3).
 * Usa la ruta real si existe; si no, la distancia aproximada.
 */
export function useEstimates(
  input: { route?: LineStringGeometry | null; distanceM?: number | null; vehicle?: VehicleChoice | null },
  modes: readonly TransportMode[],
) {
  const { route, distanceM, vehicle } = input;
  const geoKey = route ? `r:${route.coordinates.length}:${route.coordinates[0]?.join(',')}:${route.coordinates.at(-1)?.join(',')}` : `d:${Math.round(distanceM ?? 0)}`;
  const vehicleKey = vehicle ? `${vehicle.vehicle_type}:${vehicle.occupants}` : '-';
  return useQuery({
    queryKey: ['trips', 'estimate-batch', geoKey, modes.join(','), vehicleKey],
    queryFn: async () => {
      const base = route ? { route } : { distance_m: Math.round(distanceM ?? 0) };
      const withVehicle = vehicle ? modes.filter(usesVehicle) : [];
      const plain = modes.filter((m) => !withVehicle.includes(m));
      const single = (req: TripEstimateRequest) => api.trips.estimate(req);

      let items: TripEstimate[] = [];
      if (plain.length) {
        try {
          items = (await api.trips.estimateBatch({ modes: [...plain], ...base })).items;
        } catch (e) {
          if (!(e instanceof ApiError && (e.status === 404 || e.status === 405))) throw e;
          items = await Promise.all(plain.map((mode) => single({ mode, ...base })));
        }
      }
      if (withVehicle.length && vehicle) {
        items = items.concat(await Promise.all(withVehicle.map((mode) => single({ mode, ...base, ...vehicle }))));
      }
      return Object.fromEntries(items.map((e) => [e.mode, e])) as Partial<Record<TransportMode, TripEstimate>>;
    },
    enabled: modes.length > 0 && (!!route || (distanceM ?? 0) > 0),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** O3: mensaje claro cuando la estimación falla (en vez de «No encontramos lo que buscabas»). */
export function estimateErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) {
    return 'El servidor todavía no ofrece la estimación de CO₂. Puedes registrar el viaje igual: el CO₂ y los puntos se calculan al guardarlo.';
  }
  if (isNetworkError(e)) return `No pudimos calcular el impacto estimado. ${getErrorMessage(e)}`;
  return `No pudimos calcular el impacto estimado: ${getErrorMessage(e)}`;
}

/** Ruta real origen→destino (GET /routes). 503 ROUTING_UNAVAILABLE → el llamador usa línea recta. */
export function useRoute(origin: Position | null, destination: Position | null, mode: TransportMode | null) {
  return useQuery({
    queryKey: ['routes', origin?.join(','), destination?.join(','), mode],
    queryFn: () => api.routes.get({ origin: origin as Position, destination: destination as Position, mode: mode as TransportMode }),
    enabled: !!origin && !!destination && !!mode,
    staleTime: 30 * 60_000,
    retry: false,
  });
}
