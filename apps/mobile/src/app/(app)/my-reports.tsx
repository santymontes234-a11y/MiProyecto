import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { CITIZEN_REPORT_LABELS, CITIZEN_REPORT_STATUS_LABELS } from '@/features/reports/labels';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

/** Mis reportes ciudadanos (GET /citizen-reports/mine). */
export default function MyReportsScreen() {
  const { colors, spacing } = useTheme();
  const q = useInfiniteQuery({
    queryKey: ['citizen-reports', 'mine'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.citizenReports.mine({ page: pageParam, page_size: 20 }),
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}
      ListHeaderComponent={<Button label="Nuevo reporte" icon="add" variant="secondary" onPress={() => router.push('/report')} style={{ marginBottom: spacing.lg }} />}
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
      }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} colors={[colors.primary]} />}
      renderItem={({ item: r }) => (
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="label" tone="muted">
              {CITIZEN_REPORT_LABELS[r.category]}
            </AppText>
            <AppText variant="label" tone={r.status === 'RESOLVED' ? 'primary' : r.status === 'REJECTED' ? 'danger' : 'default'}>
              {CITIZEN_REPORT_STATUS_LABELS[r.status]}
            </AppText>
          </View>
          <AppText variant="bodyStrong" style={{ marginTop: spacing.xs }}>
            {r.title}
          </AppText>
          {r.description ? <AppText tone="muted">{r.description}</AppText> : null}
          {r.resolution_note ? (
            <AppText variant="caption" style={{ marginTop: spacing.sm }}>
              Respuesta: {r.resolution_note}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
            {formatDateTime(r.created_at)}
          </AppText>
        </Card>
      )}
      ListEmptyComponent={
        q.isPending ? (
          <SkeletonList rows={3} />
        ) : q.isError ? (
          <ErrorState message={getErrorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <EmptyState icon="megaphone-outline" title="Sin reportes" message="¿Viste una ciclovía dañada o falta infraestructura? Repórtalo desde el mapa." />
        )
      }
    />
  );
}
