import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDistance } from '@ecomove/shared';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';

import { EcoMap } from '@/components/map/EcoMap';
import type { MapLine, MapMarker } from '@/components/map/map-protocol';
import { Banner, Co2Comparison, ModeBadge } from '@/components/trips/TripComponents';
import { AppText, Button, Card, ConfirmDialog, Divider, Screen, Skeleton, useToast } from '@/components/ui';
import { modeMeta } from '@/features/trips/modes';
import { useTripDraft } from '@/features/trips/TripDraftProvider';
import { useEstimates } from '@/features/trips/useTrips';
import { getErrorMessage } from '@/lib/errors';
import { haversineM } from '@/lib/geo';
import { ensureForegroundPermission, locationServicesEnabled } from '@/lib/location';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 10 — Confirmación del viaje antes de iniciar el registro GPS. */
export default function ConfirmScreen() {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const draft = useTripDraft();
  const [asking, setAsking] = useState(false);
  const [starting, setStarting] = useState(false);
  const distance = draft.origin && draft.destination ? haversineM(draft.origin.coord, draft.destination.coord) : null;
  const modes = useMemo(() => (draft.mode ? [draft.mode] : []), [draft.mode]);
  const [estimate] = useEstimates(distance, modes);

  const markers = useMemo<MapMarker[]>(
    () =>
      draft.origin && draft.destination
        ? [
            { id: 'o', coord: draft.origin.coord, kind: 'origin' },
            { id: 'd', coord: draft.destination.coord, kind: 'destination' },
          ]
        : [],
    [draft.origin, draft.destination],
  );
  const lines = useMemo<MapLine[]>(
    () => (draft.origin && draft.destination ? [{ id: 'p', coords: [draft.origin.coord, draft.destination.coord], color: colors.info, dashed: true, weight: 5 }] : []),
    [draft.origin, draft.destination, colors.info],
  );
  const fitTo = useMemo(() => markers.map((m) => m.coord), [markers]);

  if (!draft.origin || !draft.destination) return <Redirect href="/trip/plan" />;
  if (!draft.mode) return <Redirect href="/trip/mode" />;
  const m = modeMeta(draft.mode);

  const start = async () => {
    setAsking(false);
    setStarting(true);
    try {
      if (!(await locationServicesEnabled())) {
        toast.error('Activa el GPS de tu dispositivo para registrar el viaje.');
        return;
      }
      const perm = await ensureForegroundPermission();
      if (perm !== 'granted') {
        toast.info('EcoMove necesita tu ubicación mientras viajas para registrar la ruta.');
        if (perm === 'blocked') void Linking.openSettings();
        return;
      }
      await draft.startRecording();
      router.replace('/trip/tracking');
    } catch {
      toast.error('No pudimos iniciar el GPS. Inténtalo de nuevo.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen footer={<Button label="Iniciar viaje" icon="play" loading={starting} onPress={() => setAsking(true)} testID="confirm-start" />}>
      <View style={{ height: 180, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.lg }}>
        <EcoMap tripMarkers={markers} routeLines={lines} fitTo={fitTo} accessibilityLabel="Vista previa del trayecto" />
      </View>

      <Card>
        <Stop color={colors.primary} letter="A" title="Origen" label={draft.origin.label} />
        <View style={{ marginLeft: 13, width: 2, height: 16, backgroundColor: colors.border }} />
        <Stop color={colors.info} letter="B" title="Destino" label={draft.destination.label} />
        <View style={{ marginVertical: spacing.md }}>
          <Divider />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ModeBadge mode={draft.mode} />
          <AppText variant="bodyStrong">≈ {formatDistance(distance ?? 0)}</AppText>
        </View>
      </Card>

      <AppText variant="subtitle" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Impacto estimado
      </AppText>
      <Card>
        {estimate?.isPending ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} style={{ marginTop: spacing.md }} />
            <Skeleton height={44} style={{ marginTop: spacing.md }} />
          </>
        ) : estimate?.isError ? (
          <Banner tone="danger" message={getErrorMessage(estimate.error)} />
        ) : estimate?.data ? (
          <Co2Comparison
            carG={estimate.data.co2_emitted_g + estimate.data.co2_saved_g}
            modeG={estimate.data.co2_emitted_g}
            savedG={estimate.data.co2_saved_g}
            modeLabel={m.label}
          />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }}>
          <Ionicons name="star-outline" size={18} color={colors.textMuted} />
          <AppText variant="caption" tone="muted" style={{ marginLeft: spacing.sm, flex: 1 }}>
            Puntos: el sistema de recompensas estará disponible pronto.
          </AppText>
        </View>
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Banner
          tone="info"
          message="Al iniciar, registraremos tu ruta real con GPS mientras la app esté abierta. Mantén la pantalla activa durante el trayecto; la distancia y el CO₂ finales los calcula el servidor."
        />
      </View>

      <ConfirmDialog
        visible={asking}
        title="¿Iniciar el viaje?"
        message={`Registraremos tu trayecto en ${m.label.toLowerCase()} con GPS. Podrás pausarlo o terminarlo cuando llegues.`}
        confirmLabel="Iniciar"
        onConfirm={() => void start()}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  );
}

function Stop({ color, letter, title, label }: { color: string; letter: string; title: string; label: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible accessibilityLabel={`${title}: ${label}`}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="overline" style={{ color: colors.onPrimary }}>
          {letter}
        </AppText>
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <AppText variant="overline" tone="muted">
          {title.toUpperCase()}
        </AppText>
        <AppText numberOfLines={2}>{label}</AppText>
      </View>
    </View>
  );
}
