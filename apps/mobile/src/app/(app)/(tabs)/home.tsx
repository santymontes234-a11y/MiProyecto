import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCo2, formatDistance } from '@ecomove/shared';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripCard } from '@/components/trips/TripComponents';
import { AppText, Button, Card, EmptyState, ErrorState, FadeIn, IconBubble, Screen, SectionHeader, Skeleton, SkeletonList, StatTile } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUnreadCount } from '@/features/gamification/useGamification';
import { useStatsMe } from '@/features/stats/useStats';
import { useRecentTrips } from '@/features/trips/useTrips';
import { getErrorMessage } from '@/lib/errors';
import { greeting } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 6 — Inicio / dashboard personal. */
export default function DashboardScreen() {
  const { user } = useAuth();
  const { colors, spacing, radius } = useTheme();
  const week = useStatsMe('week');
  const all = useStatsMe('all');
  const recent = useRecentTrips(3);
  const unread = useUnreadCount();
  const refreshing = week.isRefetching || all.isRefetching || recent.isRefetching;
  const firstName = user?.full_name.split(' ')[0] ?? '';

  const refresh = () => {
    void week.refetch();
    void all.refetch();
    void recent.refetch();
    void unread.refetch();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen refreshing={refreshing} onRefresh={refresh} edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <AppText tone="muted">{greeting()},</AppText>
            <AppText variant="title">{firstName} 👋</AppText>
          </View>
          <Pressable
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={unread.data ? `Notificaciones, ${unread.data} sin leer` : 'Notificaciones'}
            hitSlop={8}
          >
            <IconBubble icon="notifications-outline" />
            {unread.data ? (
              <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="overline" style={{ color: colors.onPrimary, letterSpacing: 0 }}>
                  {unread.data > 99 ? '99+' : unread.data}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>

        <FadeIn>
          <Card tone="primary" style={{ borderRadius: radius.xl }}>
            <AppText variant="overline" style={{ color: colors.onPrimary, opacity: 0.9 }}>
              CO₂ EVITADO EN TOTAL
            </AppText>
            {all.isPending ? (
              <Skeleton width={160} height={40} style={{ marginTop: spacing.sm, opacity: 0.4 }} />
            ) : (
              <AppText variant="display" style={{ color: colors.onPrimary, marginTop: spacing.xs }}>
                {all.data ? formatCo2(all.data.co2_saved_g) : '—'}
              </AppText>
            )}
            <AppText style={{ color: colors.onPrimary, opacity: 0.9, marginTop: spacing.xs }}>
              {all.data && all.data.trips_count > 0
                ? `En ${all.data.trips_count} ${all.data.trips_count === 1 ? 'viaje' : 'viajes'} · ${formatDistance(all.data.distance_m)} recorridos`
                : 'Registra tu primer viaje para empezar a sumar.'}
            </AppText>
          </Card>
        </FadeIn>

        <View style={{ marginTop: spacing.lg }}>
          <Button label="Registrar un viaje" icon="navigate" onPress={() => router.push('/trip/plan')} testID="start-trip" />
        </View>

        <SectionHeader title="Esta semana" action="Ver estadísticas" onAction={() => router.push('/stats')} />
        {week.isError ? (
          <ErrorState message={getErrorMessage(week.error)} onRetry={() => void week.refetch()} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {week.isPending ? (
              <>
                <Skeleton height={104} style={{ flex: 1, minWidth: 140 }} radius={radius.lg} />
                <Skeleton height={104} style={{ flex: 1, minWidth: 140 }} radius={radius.lg} />
              </>
            ) : (
              <>
                <StatTile icon="leaf" label="CO₂ evitado" value={formatCo2(week.data.co2_saved_g)} />
                <StatTile icon="navigate" label="Distancia" value={formatDistance(week.data.distance_m)} color={colors.accent} />
                <StatTile icon="repeat" label="Viajes" value={String(week.data.trips_count)} color={colors.info} />
              </>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <QuickLink icon="trophy-outline" label="Logros" onPress={() => router.push('/achievements')} />
          <QuickLink icon="podium-outline" label="Ranking" onPress={() => router.push('/ranking')} />
          <QuickLink icon="map-outline" label="Mapa" onPress={() => router.push('/map')} />
        </View>

        <SectionHeader title="Viajes recientes" action="Ver todos" onAction={() => router.push('/history')} />
        {recent.isPending ? (
          <SkeletonList rows={3} />
        ) : recent.isError ? (
          <ErrorState message={getErrorMessage(recent.error)} onRetry={() => void recent.refetch()} />
        ) : recent.data.items.length === 0 ? (
          <EmptyState
            icon="bicycle-outline"
            title="Aún no tienes viajes"
            message="Tus viajes sostenibles aparecerán aquí con el CO₂ que evitaste."
            actionLabel="Registrar mi primer viaje"
            onAction={() => router.push('/trip/plan')}
          />
        ) : (
          recent.data.items.map((t) => <TripCard key={t.id} trip={t} onPress={() => router.push({ pathname: '/trips/[id]', params: { id: t.id } })} />)
        )}
      </Screen>
    </SafeAreaView>
  );
}

function QuickLink({ icon, label, onPress }: { icon: 'trophy-outline' | 'podium-outline' | 'map-outline'; label: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md }}>
      <Ionicons name={icon} size={24} color={colors.primary} />
      <AppText variant="label" style={{ marginTop: spacing.xs }}>
        {label}
      </AppText>
    </Card>
  );
}
