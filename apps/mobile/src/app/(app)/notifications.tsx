import Ionicons from '@expo/vector-icons/Ionicons';
import type { Notification } from '@ecomove/shared';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';

import { AppText, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { useMarkRead, useNotifications } from '@/features/gamification/useGamification';
import { formatRelativeDay, formatTime } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

const ICONS: Record<Notification['type'], 'trophy' | 'calendar' | 'information-circle'> = {
  ACHIEVEMENT_UNLOCKED: 'trophy',
  WEEKLY_SUMMARY: 'calendar',
  SYSTEM: 'information-circle',
};

/** Pantalla 19 — Notificaciones in-app (GET /notifications con unread_count). */
export default function NotificationsScreen() {
  const { colors, spacing, radius } = useTheme();
  const q = useNotifications();
  const mark = useMarkRead();
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const unread = q.data?.pages[0]?.unread_count ?? 0;

  const open = (n: Notification) => {
    if (!n.read_at) mark.mutate(n.id);
    if (n.type === 'ACHIEVEMENT_UNLOCKED') router.push('/achievements');
    else if (n.type === 'WEEKLY_SUMMARY') router.push('/stats');
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={() => mark.mutate('all')} accessibilityRole="button" hitSlop={8}>
                <AppText variant="label" tone="primary">
                  Marcar todo como leído
                </AppText>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        style={{ backgroundColor: colors.background }}
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} colors={[colors.primary]} tintColor={colors.primary} />}
        renderItem={({ item: n }) => (
          <Pressable
            onPress={() => open(n)}
            accessibilityRole="button"
            accessibilityLabel={`${n.read_at ? '' : 'No leída. '}${n.title}. ${n.body}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              padding: spacing.md,
              marginBottom: spacing.sm,
              borderRadius: radius.lg,
              backgroundColor: n.read_at ? colors.surface : colors.primarySoft,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name={ICONS[n.type]} size={24} color={n.type === 'ACHIEVEMENT_UNLOCKED' ? colors.warning : colors.info} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <AppText variant="bodyStrong">{n.title}</AppText>
              <AppText tone="muted">{n.body}</AppText>
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                {formatRelativeDay(n.created_at)} · {formatTime(n.created_at)}
              </AppText>
            </View>
            {!n.read_at ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 }} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={
          q.isPending ? (
            <SkeletonList rows={5} />
          ) : q.isError ? (
            <ErrorState message="No pudimos cargar tus notificaciones." onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState icon="notifications-off-outline" title="No tienes notificaciones" message="Aquí verás tus logros desbloqueados y resúmenes semanales." />
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : undefined}
      />
    </>
  );
}
