import { formatCo2, formatDistance, formatDuration, type Granularity } from '@ecomove/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BarChart } from '@/components/trips/TripComponents';
import { AppText, Card, Chip, EmptyState, ErrorState, ListRow, Screen, SectionHeader, Skeleton, StatTile } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { RANGE_LABELS, useStatsMe, useTimeseries, type StatsRange } from '@/features/stats/useStats';
import { modeMeta } from '@/features/trips/modes';
import { getErrorMessage } from '@/lib/errors';
import { formatPeriod } from '@/lib/format';
import { withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const RANGES: StatsRange[] = ['week', 'month', 'year', 'all'];

/** Pantalla 14 — Estadísticas personales (GET /stats/me y /stats/me/timeseries). */
export default function StatsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const [range, setRange] = useState<StatsRange>('month');
  const summary = useStatsMe(range);
  const series = useTimeseries(range, user?.created_at);
  const refreshing = summary.isRefetching || series.isRefetching;

  const s = summary.data;
  const maxModeSaved = Math.max(...(s?.by_mode.map((b) => b.co2_saved_g) ?? [1]), 1);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        void summary.refetch();
        void series.refetch();
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }} accessibilityRole="tablist">
        {RANGES.map((r) => (
          <Chip key={r} label={RANGE_LABELS[r]} selected={range === r} onPress={() => setRange(r)} />
        ))}
      </View>

      {summary.isError ? (
        <ErrorState message={getErrorMessage(summary.error)} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <Card tone="soft" style={{ marginTop: spacing.lg }}>
            <AppText variant="overline" style={{ color: colors.primaryStrong }}>
              CO₂ EVITADO · {RANGE_LABELS[range].toUpperCase()}
            </AppText>
            {s ? (
              <AppText variant="display" style={{ color: colors.primaryStrong }}>
                {formatCo2(s.co2_saved_g)}
              </AppText>
            ) : (
              <Skeleton height={40} width={150} style={{ marginTop: spacing.xs }} />
            )}
            {s ? (
              <AppText variant="caption" style={{ color: colors.primaryStrong }}>
                Emitiste {formatCo2(s.co2_emitted_g)} en tus viajes sostenibles
              </AppText>
            ) : null}
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
            {s ? (
              <>
                <StatTile icon="repeat" label="Viajes" value={String(s.trips_count)} color={colors.info} />
                <StatTile icon="navigate" label="Distancia" value={formatDistance(s.distance_m)} color={colors.accent} />
                <StatTile icon="time" label="Tiempo en movimiento" value={formatDuration(s.duration_s)} color={colors.primary} />
              </>
            ) : (
              [0, 1, 2].map((i) => <Skeleton key={i} height={104} radius={radius.lg} style={{ flex: 1, minWidth: 140 }} />)
            )}
          </View>

          <SectionHeader title="Evolución del CO₂ evitado" />
          <Card>
            {series.isPending ? (
              <Skeleton height={160} />
            ) : series.isError ? (
              <ErrorState message={getErrorMessage(series.error)} onRetry={() => void series.refetch()} />
            ) : series.data.points.length === 0 ? (
              <AppText tone="muted" align="center">
                Sin datos en este periodo.
              </AppText>
            ) : (
              <BarChart
                data={series.data.points.slice(-12).map((p) => ({
                  key: p.period_start,
                  label: formatPeriod(p.period_start, series.data.granularity as Granularity),
                  value: p.co2_saved_g,
                  display: formatCo2(p.co2_saved_g),
                }))}
              />
            )}
          </Card>

          <SectionHeader title="Por medio de transporte" />
          {s && s.by_mode.length === 0 ? (
            <EmptyState icon="bicycle-outline" title="Sin viajes en este periodo" actionLabel="Registrar un viaje" onAction={() => router.push('/trip/plan')} />
          ) : (
            <Card>
              {(s?.by_mode ?? []).map((b) => {
                const m = modeMeta(b.mode);
                return (
                  <View key={b.mode} style={{ marginBottom: spacing.sm }}>
                    <ListRow icon={m.icon} iconColor={m.color} title={m.label} subtitle={`${b.trips_count} viajes · ${formatDistance(b.distance_m)}`} right={<AppText variant="bodyStrong">{formatCo2(b.co2_saved_g)}</AppText>} />
                    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${(b.co2_saved_g / maxModeSaved) * 100}%`, backgroundColor: withAlpha(m.color, 0.9) }} />
                    </View>
                  </View>
                );
              })}
              {!s ? <Skeleton height={120} /> : null}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
