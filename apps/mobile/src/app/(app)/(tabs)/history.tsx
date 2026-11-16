import type { TransportMode } from '@ecomove/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from 'react-native';

import { TripCard } from '@/components/trips/TripComponents';
import { AppText, Chip, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { modeMeta, SUSTAINABLE_MODES } from '@/features/trips/modes';
import { useTripsInfinite } from '@/features/trips/useTrips';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 12 — Historial de viajes paginado con filtro por modo. */
export default function HistoryScreen() {
  const { colors, spacing } = useTheme();
  const [mode, setMode] = useState<TransportMode | undefined>(undefined);
  const q = useTripsInfinite(mode);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const total = q.data?.pages[0]?.total ?? 0;

  const header = (
    <View style={{ paddingTop: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
        <Chip label="Todos" selected={!mode} onPress={() => setMode(undefined)} />
        {SUSTAINABLE_MODES.map((m) => {
          const meta = modeMeta(m);
          return <Chip key={m} label={meta.label} icon={meta.icon} selected={mode === m} onPress={() => setMode(mode === m ? undefined : m)} />;
        })}
      </ScrollView>
      {q.data ? (
        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing.md }}>
          {total} {total === 1 ? 'viaje' : 'viajes'}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <TripCard trip={item} onPress={() => router.push({ pathname: '/trips/[id]', params: { id: item.id } })} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={
          q.isPending ? (
            <SkeletonList rows={6} />
          ) : q.isError ? (
            <ErrorState message={getErrorMessage(q.error)} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState
              icon="time-outline"
              title={mode ? `Sin viajes en ${modeMeta(mode).label.toLowerCase()}` : 'Tu historial está vacío'}
              message={mode ? 'Prueba con otro filtro.' : 'Cuando registres un viaje sostenible aparecerá aquí.'}
              actionLabel={mode ? undefined : 'Registrar un viaje'}
              onAction={mode ? undefined : () => router.push('/trip/plan')}
            />
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : undefined}
      />
    </View>
  );
}
