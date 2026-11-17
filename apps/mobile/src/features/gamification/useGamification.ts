import type { RankingPeriod, User } from '@ecomove/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export const useGamificationProfile = () => useQuery({ queryKey: ['gamification', 'me'], queryFn: () => api.gamification.me() });

export const useMyAchievements = () => useQuery({ queryKey: ['gamification', 'achievements'], queryFn: () => api.users.achievements() });

export const useRanking = (period: RankingPeriod) =>
  useQuery({ queryKey: ['gamification', 'ranking', period], queryFn: () => api.gamification.ranking(period) });

export function useRankingOptIn(onUser: (u: User) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) => api.users.updateMe({ ranking_opt_in: value }),
    onSuccess: (u) => {
      onUser(u);
      void qc.invalidateQueries({ queryKey: ['gamification', 'ranking'] });
    },
  });
}

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.notifications.list({ page: pageParam, page_size: 20 }),
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
}

/** Solo el contador (página mínima). Se refresca al volver al inicio. */
export const useUnreadCount = () =>
  useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.notifications.list({ page: 1, page_size: 1, unread_only: true })).unread_count,
    staleTime: 30_000,
  });

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? api.notifications.markAllRead() : api.notifications.markRead(id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
