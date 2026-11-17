import { formatDistance } from '@ecomove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { ModeBadge } from '@/components/trips/TripComponents';
import { AppText, Button, Card, ConfirmDialog, EmptyState, ErrorState, Screen, SkeletonList, useToast } from '@/components/ui';
import { listPendingTrips, removePendingTrip } from '@/features/trips/pending-trips';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { pathLengthM } from '@/lib/geo';
import { useTheme } from '@/theme/ThemeProvider';

/** Viajes guardados en el teléfono que el servidor aún no aceptó (sin red o MODE_INACTIVE, contrato §4.1). */
export default function PendingTripsScreen() {
  const { spacing } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [discard, setDiscard] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['pending-trips'], queryFn: listPendingTrips, staleTime: 0 });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const entry = q.data?.find((p) => p.payload.client_trip_id === id);
      if (!entry) return;
      await api.trips.create(entry.payload); // mismo client_trip_id → idempotente
      removePendingTrip(id);
    },
    onSuccess: () => {
      toast.success('Viaje guardado.');
      void qc.invalidateQueries({ queryKey: ['pending-trips'] });
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['gamification'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isPending ? (
        <SkeletonList rows={3} />
      ) : q.isError ? (
        <ErrorState message="No pudimos leer los viajes guardados en el teléfono." onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState icon="cloud-done-outline" title="Todo sincronizado" message="No tienes viajes pendientes de enviar." />
      ) : (
        q.data.map((p) => (
          <Card key={p.payload.client_trip_id} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <ModeBadge mode={p.payload.mode} />
              <AppText variant="caption" tone="muted">
                {formatDateTime(p.payload.started_at)}
              </AppText>
            </View>
            <AppText style={{ marginTop: spacing.sm }}>≈ {formatDistance(pathLengthM(p.payload.route.coordinates))}</AppText>
            <AppText variant="caption" tone="muted">
              {p.reason === 'MODE_INACTIVE' ? 'El medio de transporte estaba desactivado al enviarlo.' : 'No había conexión al enviarlo.'}
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                label="Reintentar"
                icon="cloud-upload"
                fullWidth={false}
                style={{ flex: 1 }}
                size="md"
                loading={retry.isPending && retry.variables === p.payload.client_trip_id}
                onPress={() => retry.mutate(p.payload.client_trip_id)}
              />
              <Button label="Descartar" variant="ghost" fullWidth={false} style={{ flex: 1 }} size="md" onPress={() => setDiscard(p.payload.client_trip_id)} />
            </View>
          </Card>
        ))
      )}
      <ConfirmDialog
        visible={!!discard}
        title="¿Descartar este viaje?"
        message="Se borrará del teléfono y no se podrá recuperar."
        confirmLabel="Descartar"
        destructive
        onConfirm={() => {
          if (discard) removePendingTrip(discard);
          setDiscard(null);
          void q.refetch();
        }}
        onCancel={() => setDiscard(null)}
      />
    </Screen>
  );
}
