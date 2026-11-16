import { ApiError } from '@ecomove/shared';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) => {
        // No reintentar errores del cliente (4xx): solo red o 5xx, hasta 2 veces.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Claves de caché centralizadas. */
export const queryKeys = {
  me: ['users', 'me'] as const,
  trips: (mode?: string) => ['trips', 'list', mode ?? 'all'] as const,
  trip: (id: string) => ['trips', 'detail', id] as const,
  statsMe: (range: string) => ['stats', 'me', range] as const,
  timeseries: (granularity: string, from: string, to: string) => ['stats', 'timeseries', granularity, from, to] as const,
  statsCity: ['stats', 'city'] as const,
  pois: (bbox: string, categories: string) => ['map', 'pois', bbox, categories] as const,
  cycleways: (bbox: string) => ['map', 'cycleways', bbox] as const,
  estimate: (distanceM: number, mode: string) => ['trips', 'estimate', Math.round(distanceM), mode] as const,
};
