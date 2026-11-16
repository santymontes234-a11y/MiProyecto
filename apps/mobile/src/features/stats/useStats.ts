import type { Granularity } from '@ecomove/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

export type StatsRange = 'week' | 'month' | 'year' | 'all';

export const RANGE_LABELS: Record<StatsRange, string> = {
  week: '7 días',
  month: '30 días',
  year: '12 meses',
  all: 'Todo',
};

const RANGE_DAYS: Record<Exclude<StatsRange, 'all'>, number> = { week: 7, month: 30, year: 365 };
const RANGE_GRANULARITY: Record<StatsRange, Granularity> = { week: 'day', month: 'week', year: 'month', all: 'month' };

/** Rango [from, to] en ISO UTC, redondeado al inicio del día para estabilizar la caché. */
export function rangeBounds(range: StatsRange, now = new Date()): { from?: string; to?: string } {
  if (range === 'all') return {};
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - RANGE_DAYS[range] + 1);
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Fecha de referencia fijada al montar (las funciones de render deben ser puras). */
function useNow(): Date {
  const [now] = useState(() => new Date());
  return now;
}

export function useStatsMe(range: StatsRange) {
  const bounds = rangeBounds(range, useNow());
  return useQuery({ queryKey: queryKeys.statsMe(range), queryFn: () => api.stats.me(bounds) });
}

export function useTimeseries(range: StatsRange, accountCreatedAt?: string) {
  const now = useNow();
  const bounds = rangeBounds(range, now);
  const from = bounds.from ?? accountCreatedAt ?? new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const to = bounds.to ?? now.toISOString();
  const granularity = RANGE_GRANULARITY[range];
  return useQuery({
    queryKey: queryKeys.timeseries(granularity, from.slice(0, 10), to.slice(0, 10)),
    queryFn: () => api.stats.meTimeseries({ granularity, from, to }),
  });
}
