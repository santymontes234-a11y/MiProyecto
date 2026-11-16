import { formatCo2, formatDistance, formatDuration } from '@ecomove/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { EcoMap } from '@/components/map/EcoMap';
import type { MapLine, MapMarker } from '@/components/map/map-protocol';
import { Co2Comparison, ModeBadge } from '@/components/trips/TripComponents';
import { AppText, Button, Card, ConfirmDialog, ErrorState, ListRow, Screen, Skeleton, useToast } from '@/components/ui';
import { modeMeta } from '@/features/trips/modes';
import { useDeleteTrip, useTrip } from '@/features/trips/useTrips';
import { getErrorMessage } from '@/lib/errors';
import { formatDate, formatTime } from '@/lib/format';
import { simplify } from '@/lib/geo';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 13 — Detalle de viaje con su ruta, CO₂ y opción de eliminar. */
export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const q = useTrip(id);
  const del = useDeleteTrip();
  const [confirm, setConfirm] = useState(false);

  const coords = useMemo(() => {
    const c = q.data?.route.coordinates ?? [];
    return c.length > 800 ? simplify(c, 4) : c;
  }, [q.data]);
  const lines = useMemo<MapLine[]>(
    () => (q.data && coords.length > 1 ? [{ id: 'r', coords, color: modeMeta(q.data.mode).color, weight: 5 }] : []),
    [coords, q.data],
  );
  const markers = useMemo<MapMarker[]>(() => {
    const first = coords[0];
    const last = coords.at(-1);
    return first && last
      ? [
          { id: 'a', coord: first, kind: 'origin', label: 'Inicio' },
          { id: 'b', coord: last, kind: 'destination', label: 'Fin' },
        ]
      : [];
  }, [coords]);

  if (q.isPending) {
    return (
      <Screen>
        <Skeleton height={220} radius={radius.lg} />
        <Skeleton height={28} width="50%" style={{ marginTop: spacing.lg }} />
        <Skeleton height={120} radius={radius.lg} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen>
        <ErrorState message={getErrorMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const trip = q.data;
  const m = modeMeta(trip.mode);

  const remove = () => {
    del.mutate(trip.id, {
      onSuccess: () => {
        setConfirm(false);
        toast.success('Viaje eliminado.');
        router.back();
      },
      onError: (e) => {
        setConfirm(false);
        toast.error(getErrorMessage(e));
      },
    });
  };

  return (
    <Screen>
      <View style={{ height: 240, borderRadius: radius.lg, overflow: 'hidden' }}>
        <EcoMap routeLines={lines} tripMarkers={markers} fitTo={coords} accessibilityLabel={`Ruta del viaje en ${m.label}`} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg }}>
        <ModeBadge mode={trip.mode} />
        {trip.status === 'CANCELLED' ? (
          <AppText variant="label" tone="danger">
            Cancelado
          </AppText>
        ) : null}
      </View>
      <AppText variant="title" style={{ marginTop: spacing.sm }}>
        {formatDate(trip.started_at)}
      </AppText>
      <AppText tone="muted">
        {formatTime(trip.started_at)} – {formatTime(trip.ended_at)}
      </AppText>

      <Card style={{ marginTop: spacing.lg }}>
        <ListRow icon="navigate" iconColor={colors.accent} title={formatDistance(trip.distance_m)} subtitle="Distancia (calculada por el servidor)" />
        <ListRow icon="time" iconColor={colors.info} title={formatDuration(trip.duration_s)} subtitle="Duración" />
        <ListRow icon="leaf" title={formatCo2(trip.co2_saved_g)} subtitle="CO₂ evitado" />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Co2Comparison carG={trip.co2_emitted_g + trip.co2_saved_g} modeG={trip.co2_emitted_g} savedG={trip.co2_saved_g} modeLabel={m.label} />
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
          Factor aplicado: {trip.emission_factor_g_per_km.toLocaleString('es-MX')} g CO₂/km
        </AppText>
      </Card>

      <Button label="Eliminar viaje" icon="trash-outline" variant="ghost" style={{ marginTop: spacing.xl }} onPress={() => setConfirm(true)} />

      <ConfirmDialog
        visible={confirm}
        title="¿Eliminar este viaje?"
        message="Se borrará el viaje y su ruta, y dejará de contar en tus estadísticas. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        loading={del.isPending}
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}
