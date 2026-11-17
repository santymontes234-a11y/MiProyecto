import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { AppText, Card, EmptyState, ErrorState, Screen, SectionHeader, Skeleton } from '@/components/ui';
import { useGamificationProfile, useMyAchievements } from '@/features/gamification/useGamification';
import { getErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** El backend envía un nombre de icono; si no existe en Ionicons se usa un trofeo. */
function iconFor(name: string): IconName {
  return (name in Ionicons.glyphMap ? name : 'trophy') as IconName;
}

/** Pantalla 16 — Logros y recompensas (GET /gamification/me y /users/me/achievements). */
export default function AchievementsScreen() {
  const { colors, spacing, radius } = useTheme();
  const profile = useGamificationProfile();
  const achievements = useMyAchievements();
  const p = profile.data;
  const span = p && p.next_level_points !== null ? p.next_level_points - p.level_points : 0;
  const pct = p && span > 0 ? Math.min(1, (p.points_total - p.level_points) / span) : 1;
  const sorted = [...(achievements.data ?? [])].sort((a, b) => Number(!!b.awarded_at) - Number(!!a.awarded_at));
  const unlocked = sorted.filter((a) => a.awarded_at).length;

  return (
    <Screen
      refreshing={profile.isRefetching || achievements.isRefetching}
      onRefresh={() => {
        void profile.refetch();
        void achievements.refetch();
      }}
    >
      {profile.isError ? (
        <ErrorState message={getErrorMessage(profile.error)} onRetry={() => void profile.refetch()} />
      ) : (
        <Card tone="primary" style={{ borderRadius: radius.xl }}>
          {p ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="overline" style={{ color: colors.onPrimary }}>
                  NIVEL {p.level}
                </AppText>
                <Ionicons name="star" size={22} color={colors.warning} />
              </View>
              <AppText variant="display" style={{ color: colors.onPrimary }}>
                {p.points_total.toLocaleString('es-MX')} pts
              </AppText>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
                style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.primaryStrong, marginTop: spacing.md, overflow: 'hidden' }}
              >
                <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: colors.warning }} />
              </View>
              <AppText variant="caption" style={{ color: colors.onPrimary, marginTop: spacing.xs }}>
                {p.next_level_points === null
                  ? '¡Alcanzaste el nivel máximo!'
                  : `Te faltan ${(p.next_level_points - p.points_total).toLocaleString('es-MX')} pts para el nivel ${p.level + 1}`}
              </AppText>
            </>
          ) : (
            <Skeleton height={96} style={{ opacity: 0.4 }} />
          )}
        </Card>
      )}

      <SectionHeader title={achievements.data ? `Logros (${unlocked}/${sorted.length})` : 'Logros'} />
      {achievements.isPending ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={150} radius={radius.lg} style={{ flexBasis: '47%', flexGrow: 1 }} />
          ))}
        </View>
      ) : achievements.isError ? (
        <ErrorState message={getErrorMessage(achievements.error)} onRetry={() => void achievements.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState icon="trophy-outline" title="Aún no hay logros activos" message="Pronto habrá nuevos retos para ti." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {sorted.map(({ achievement: a, awarded_at, progress }) => {
            const done = !!awarded_at;
            const ratio = a.threshold > 0 ? Math.min(1, progress / a.threshold) : 0;
            return (
              <Card
                key={a.id}
                style={{ flexBasis: '47%', flexGrow: 1, alignItems: 'center', opacity: done ? 1 : 0.85 }}
                accessibilityLabel={`${a.name}. ${a.description}. ${done ? 'Desbloqueado' : `Progreso ${progress} de ${a.threshold}`}`}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: done ? colors.primarySoft : colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={iconFor(a.icon)} size={28} color={done ? colors.primary : colors.textMuted} />
                </View>
                <AppText variant="bodyStrong" align="center" style={{ marginTop: spacing.sm }}>
                  {a.name}
                </AppText>
                <AppText variant="caption" tone="muted" align="center">
                  {a.description}
                </AppText>
                {done ? (
                  <AppText variant="caption" tone="primary" style={{ marginTop: spacing.sm }}>
                    {awarded_at ? formatDate(awarded_at) : ''} · +{a.bonus_points} pts
                  </AppText>
                ) : (
                  <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: colors.primary }} />
                    </View>
                    <AppText variant="caption" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
                      {Math.round(ratio * 100)}% · +{a.bonus_points} pts
                    </AppText>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
