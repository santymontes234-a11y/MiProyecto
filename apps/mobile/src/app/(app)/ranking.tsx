import { formatCo2, type RankingPeriod } from '@ecomove/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { AppText, Avatar, Card, Chip, Divider, EmptyState, ErrorState, ListRow, Screen, SectionHeader, SkeletonList, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRanking, useRankingOptIn } from '@/features/gamification/useGamification';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/query-client';
import { useTheme } from '@/theme/ThemeProvider';

const PERIODS: { value: RankingPeriod; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'all', label: 'Histórico' },
];

/** Pantalla 17 — Ranking (GET /gamification/ranking, opt-in con ranking_opt_in) + impacto de la ciudad. */
export default function RankingScreen() {
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [period, setPeriod] = useState<RankingPeriod>('week');
  const ranking = useRanking(period);
  const optIn = useRankingOptIn(setUser);
  const city = useQuery({ queryKey: queryKeys.statsCity, queryFn: () => api.stats.city() });

  const toggle = (value: boolean) =>
    optIn.mutate(value, {
      onSuccess: () => toast.success(value ? 'Ahora apareces en el ranking.' : 'Ya no apareces en el ranking.'),
      onError: (e) => toast.error(getErrorMessage(e)),
    });

  return (
    <Screen refreshing={ranking.isRefetching} onRefresh={() => void ranking.refetch()}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Participar en el ranking</AppText>
            <AppText variant="caption" tone="muted">
              Solo se muestra tu nombre y la inicial de tu apellido.
            </AppText>
          </View>
          <Switch
            value={!!user?.ranking_opt_in}
            onValueChange={toggle}
            disabled={optIn.isPending}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Participar en el ranking"
          />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }} accessibilityRole="tablist">
        {PERIODS.map((p) => (
          <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} />
        ))}
      </View>

      {ranking.data?.me ? (
        <Card tone="soft" style={{ marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center' }}>
          <AppText variant="title" style={{ color: colors.primaryStrong, width: 64 }}>
            #{ranking.data.me.position}
          </AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" style={{ color: colors.primaryStrong }}>
              Tu posición
            </AppText>
            <AppText variant="caption" style={{ color: colors.primaryStrong }}>
              {ranking.data.me.points.toLocaleString('es-MX')} pts
            </AppText>
          </View>
        </Card>
      ) : null}

      <SectionHeader title="Top de Querétaro" />
      {ranking.isPending ? (
        <SkeletonList rows={5} />
      ) : ranking.isError ? (
        <ErrorState message={getErrorMessage(ranking.error)} onRetry={() => void ranking.refetch()} />
      ) : ranking.data.entries.length === 0 ? (
        <EmptyState icon="podium-outline" title="Aún no hay participantes" message="Activa tu participación y sé la primera persona en el ranking." />
      ) : (
        <Card padded={false}>
          {ranking.data.entries.map((e, i) => (
            <View key={`${e.position}-${e.display_name}`}>
              {i > 0 ? <Divider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: e.is_me ? colors.primarySoft : 'transparent' }}>
                <AppText variant="bodyStrong" style={{ width: 40 }} tone={e.position <= 3 ? 'primary' : 'default'}>
                  {e.position <= 3 ? ['🥇', '🥈', '🥉'][e.position - 1] : `#${e.position}`}
                </AppText>
                <Avatar name={e.display_name} size={36} />
                <AppText style={{ flex: 1, marginLeft: spacing.md }}>
                  {e.display_name}
                  {e.is_me ? ' (tú)' : ''}
                </AppText>
                <AppText variant="bodyStrong">{e.points.toLocaleString('es-MX')} pts</AppText>
              </View>
            </View>
          ))}
        </Card>
      )}

      {city.data && city.data.trips_count > 0 ? (
        <>
          <SectionHeader title="Querétaro en conjunto" />
          <Card>
            <ListRow icon="leaf" title={formatCo2(city.data.co2_saved_g)} subtitle="CO₂ evitado por todas las personas usuarias" />
            <ListRow icon="repeat" iconColor={colors.info} title={city.data.trips_count.toLocaleString('es-MX')} subtitle="Viajes sostenibles registrados" />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
