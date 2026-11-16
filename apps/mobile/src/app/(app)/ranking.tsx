import { formatCo2, formatDistance } from '@ecomove/shared';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { AppText, Card, ComingSoonState, ErrorState, ListRow, Screen, SectionHeader, Skeleton, StatTile } from '@/components/ui';
import { modeMeta } from '@/features/trips/modes';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/query-client';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Pantalla 17 — Ranking.
 * El ranking individual requiere la propuesta de gamificación (privacidad/opt-in).
 * Mientras tanto se muestra el impacto agregado y anónimo de la ciudad (GET /stats/city).
 */
export default function RankingScreen() {
  const { colors, spacing, radius } = useTheme();
  const city = useQuery({ queryKey: queryKeys.statsCity, queryFn: () => api.stats.city() });

  return (
    <Screen refreshing={city.isRefetching} onRefresh={() => void city.refetch()}>
      <ComingSoonState
        title="Ranking en preparación"
        message="Podrás compararte con otras personas que decidan participar. Tu nombre solo aparecerá si tú lo autorizas."
      />
      <SectionHeader title="Querétaro en conjunto" />
      {city.isPending ? (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Skeleton height={104} radius={radius.lg} style={{ flex: 1 }} />
          <Skeleton height={104} radius={radius.lg} style={{ flex: 1 }} />
        </View>
      ) : city.isError ? (
        <ErrorState message={getErrorMessage(city.error)} onRetry={() => void city.refetch()} />
      ) : city.data.trips_count === 0 ? (
        <Card>
          <AppText tone="muted">Aún no hay suficientes viajes en la ciudad para mostrar datos agregados de forma anónima.</AppText>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <StatTile icon="leaf" label="CO₂ evitado por todos" value={formatCo2(city.data.co2_saved_g)} />
            <StatTile icon="repeat" label="Viajes sostenibles" value={city.data.trips_count.toLocaleString('es-MX')} color={colors.info} />
            <StatTile icon="navigate" label="Distancia total" value={formatDistance(city.data.distance_m)} color={colors.accent} />
          </View>
          <SectionHeader title="Modos más usados" />
          <Card>
            {[...city.data.by_mode]
              .sort((a, b) => b.trips_count - a.trips_count)
              .map((b, i) => {
                const m = modeMeta(b.mode);
                return (
                  <ListRow
                    key={b.mode}
                    icon={m.icon}
                    iconColor={m.color}
                    title={`${i + 1}. ${m.label}`}
                    subtitle={`${b.trips_count.toLocaleString('es-MX')} viajes`}
                    right={<AppText variant="bodyStrong">{formatCo2(b.co2_saved_g)}</AppText>}
                  />
                );
              })}
          </Card>
          <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
            Datos agregados y anónimos de todas las personas usuarias.
          </AppText>
        </>
      )}
    </Screen>
  );
}
