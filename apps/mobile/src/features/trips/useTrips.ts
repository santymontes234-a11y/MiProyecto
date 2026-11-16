import type { Paginated, TransportMode, TripSummary } from '@ecomove/shared';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

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
 * Previsualización de CO₂ por modo vía POST /trips/estimate (ADR-002: el cliente no calcula CO₂).
 * Usa distance_m para no reenviar la geometría en cada petición.
 */
export function useEstimates(distanceM: number | null, modes: readonly TransportMode[]) {
  return useQueries({
    queries: modes.map((mode) => ({
      queryKey: queryKeys.estimate(distanceM ?? 0, mode),
      queryFn: () => api.trips.estimate({ mode, distance_m: Math.round(distanceM ?? 0) }),
      enabled: distanceM !== null && distanceM > 0,
      staleTime: 10 * 60_000,
    })),
  });
}
