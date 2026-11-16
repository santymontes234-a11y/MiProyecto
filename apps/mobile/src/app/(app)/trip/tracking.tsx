import { formatDistance } from '@ecomove/shared';
import * as Haptics from 'expo-haptics';
import { Redirect, router, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EcoMap } from '@/components/map/EcoMap';
import type { MapLine, MapMarker } from '@/components/map/map-protocol';
import { Banner, ModeBadge } from '@/components/trips/TripComponents';
import { AppText, Button, ConfirmDialog } from '@/components/ui';
import { RouteTooShortError, useTripDraft } from '@/features/trips/TripDraftProvider';
import { getErrorMessage, isNetworkError } from '@/lib/errors';
import { formatClock } from '@/lib/format';
import { simplify } from '@/lib/geo';
import { useTheme } from '@/theme/ThemeProvider';

/** Viaje en curso: registra la traza GPS en primer plano y la sube completa al terminar (ADR-004). */
export default function TrackingScreen() {
  const { colors, spacing, radius, elevation } = useTheme();
  const draft = useTripDraft();
  const { recording } = draft;
  const [now, setNow] = useState(() => Date.now());
  const [dialog, setDialog] = useState<'finish' | 'cancel' | null>(null);

  // Cronómetro visual.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Evita salir con el botón atrás mientras se graba: pide confirmación para descartar.
  const active = recording.status === 'recording' || recording.status === 'paused' || recording.status === 'uploading';
  const disablePrevention = usePreventRemove(active, () => setDialog('cancel'));

  // Simplificación ligera solo para dibujar (la traza completa se envía intacta, salvo límite de puntos).
  const drawn = useMemo(() => (recording.points.length > 500 ? simplify(recording.points, 3) : recording.points), [recording.points]);
  const lines = useMemo<MapLine[]>(() => (drawn.length > 1 ? [{ id: 'trace', coords: drawn, color: colors.primary, weight: 6 }] : []), [drawn, colors.primary]);
  const last = recording.points.at(-1);
  const user = useMemo<MapMarker | null>(() => (last ? { id: 'me', coord: last, kind: 'user' } : null), [last]);
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    const first = recording.points[0];
    if (first) m.push({ id: 'start', coord: first, kind: 'origin', label: 'Inicio' });
    if (draft.destination) m.push({ id: 'dest', coord: draft.destination.coord, kind: 'destination', label: 'Destino' });
    return m;
  }, [recording.points, draft.destination]);
  // Encuadre con el primer fix y el destino (estable: solo cambia cuando llega el primer punto).
  const firstPoint = recording.points[0];
  const destCoord = draft.destination?.coord;
  const fitTo = useMemo(() => (firstPoint && destCoord ? [firstPoint, destCoord] : null), [firstPoint, destCoord]);

  if (!draft.mode || recording.status === 'idle') return <Redirect href="/" />;

  const elapsed = recording.startedAt ? (now - new Date(recording.startedAt).getTime()) / 1000 : 0;
  const uploading = recording.status === 'uploading';
  const failed = recording.status === 'error';

  const finish = async () => {
    setDialog(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const trip = await draft.finishAndUpload();
    if (trip) {
      disablePrevention();
      router.replace('/trip/result');
    }
  };

  const retry = async () => {
    const trip = await draft.retryUpload();
    if (trip) {
      disablePrevention();
      router.replace('/trip/result');
    }
  };

  const cancel = () => {
    setDialog(null);
    draft.discardRecording();
    disablePrevention();
    router.replace('/');
  };

  const tooShort = draft.uploadError instanceof RouteTooShortError;

  return (
    <View style={{ flex: 1 }}>
      <EcoMap tripMarkers={markers} routeLines={lines} userMarker={user} fitTo={fitTo} accessibilityLabel="Mapa con tu recorrido en vivo" />

      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...elevation.card }]}>
        <View style={{ padding: spacing.xl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ModeBadge mode={draft.mode} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityLiveRegion="polite">
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: recording.status === 'recording' ? colors.danger : colors.textMuted, marginRight: spacing.xs }} />
              <AppText variant="label" tone="muted">
                {recording.status === 'recording' ? 'Grabando' : recording.status === 'paused' ? 'En pausa' : uploading ? 'Guardando…' : failed ? 'Sin guardar' : ''}
              </AppText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginTop: spacing.lg }}>
            <Metric label="Tiempo" value={formatClock(elapsed)} />
            <Metric label="Distancia aprox." value={formatDistance(draft.liveDistanceM)} />
            <Metric label="Puntos GPS" value={String(recording.points.length)} />
          </View>

          {recording.gpsError ? (
            <View style={{ marginTop: spacing.md }}>
              <Banner tone="warning" message="Señal GPS débil. Seguimos intentando registrar tu ruta." />
            </View>
          ) : recording.points.length === 0 && recording.status === 'recording' ? (
            <View style={{ marginTop: spacing.md }}>
              <Banner tone="info" message="Buscando señal GPS… Sal a un espacio abierto si tarda." />
            </View>
          ) : null}

          {failed ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Banner
                tone="danger"
                message={
                  tooShort
                    ? 'No registramos suficientes puntos GPS para guardar este viaje.'
                    : isNetworkError(draft.uploadError)
                      ? 'Sin conexión. Tu viaje sigue en este dispositivo: reintenta cuando tengas señal.'
                      : getErrorMessage(draft.uploadError)
                }
              />
              {tooShort ? (
                <Button label="Volver al inicio" variant="secondary" onPress={cancel} />
              ) : (
                <>
                  <Button label="Reintentar guardar" icon="cloud-upload" onPress={() => void retry()} />
                  <Button label="Descartar viaje" variant="ghost" onPress={() => setDialog('cancel')} />
                </>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
              {recording.status === 'paused' ? (
                <Button label="Reanudar" icon="play" variant="secondary" fullWidth={false} style={{ flex: 1 }} onPress={() => void draft.resumeRecording()} />
              ) : (
                <Button label="Pausar" icon="pause" variant="secondary" fullWidth={false} style={{ flex: 1 }} disabled={uploading} onPress={draft.pauseRecording} />
              )}
              <Button label="Terminar" icon="flag" fullWidth={false} style={{ flex: 1 }} loading={uploading} onPress={() => setDialog('finish')} />
            </View>
          )}
          {!failed && !uploading ? (
            <Button label="Cancelar viaje" variant="ghost" onPress={() => setDialog('cancel')} style={{ marginTop: spacing.xs }} />
          ) : null}
        </View>
      </SafeAreaView>

      <ConfirmDialog
        visible={dialog === 'finish'}
        title="¿Terminar el viaje?"
        message="Guardaremos tu recorrido y calcularemos el CO₂ evitado."
        confirmLabel="Terminar y guardar"
        onConfirm={() => void finish()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === 'cancel'}
        title="¿Descartar el viaje?"
        message="Se perderá el recorrido registrado. Esta acción no se puede deshacer."
        confirmLabel="Descartar"
        destructive
        onConfirm={cancel}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

