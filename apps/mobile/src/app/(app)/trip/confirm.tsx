import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCo2, formatDistance, formatDuration, VEHICLE_TYPE_LABELS } from '@ecomove/shared';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';

import { EcoMap } from '@/components/map/EcoMap';
import type { MapLine, MapMarker } from '@/components/map/map-protocol';
import { Banner, Co2Comparison, ModeBadge } from '@/components/trips/TripComponents';
import { AppText, Button, Card, ConfirmDialog, Divider, Screen, Skeleton, useToast } from '@/components/ui';
import { modeMeta } from '@/features/trips/modes';
import { useTripDraft } from '@/features/trips/TripDraftProvider';
import { estimateErrorMessage, useEstimates, useRoute } from '@/features/trips/useTrips';
import { usesVehicle } from '@/features/trips/vehicle';
import { errorCode, getErrorMessage } from '@/lib/errors';
import { haversineM } from '@/lib/geo';
import { ensureForegroundPermission, locationServicesEnabled } from '@/lib/location';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 10 — Confirmación: ruta del medio elegido, impacto estimado e inicio (GPS) o registro de viaje ya hecho. */
export default function ConfirmScreen() {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const draft = useTripDraft();
  const [dialog, setDialog] = useState<'gps' | 'planned' | null>(null);
  const [busy, setBusy] = useState(false);
  const { setPlannedRoute } = draft;

  const route = useRoute(draft.origin?.coord ?? null, draft.destination?.coord ?? null, draft.mode);
  useEffect(() => {
    setPlannedRoute(route.data ?? null);
  }, [route.data, setPlannedRoute]);

  const approx = draft.origin && draft.destination ? haversineM(draft.origin.coord, draft.destination.coord) : null;
  const modes = useMemo(() => (draft.mode ? [draft.mode] : []), [draft.mode]);
  const vehicle = usesVehicle(draft.mode) ? draft.vehicle : null;
  const estimates = useEstimates(route.data ? { route: route.data.route, vehicle } : { distanceM: route.isFetching ? null : approx, vehicle }, modes);
  const estimate = draft.mode ? estimates.data?.[draft.mode] : undefined;

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
  const lines = useMemo<MapLine[]>(() => {
    if (!draft.origin || !draft.destination) return [];
    if (route.data) return [{ id: 'p', coords: route.data.route.coordinates, color: colors.primary, weight: 5 }];
    return [{ id: 'p', coords: [draft.origin.coord, draft.destination.coord], color: colors.info, dashed: true, weight: 5 }];
  }, [draft.origin, draft.destination, route.data, colors.primary, colors.info]);
  const fitTo = useMemo(() => (route.data ? route.data.route.coordinates : markers.map((m) => m.coord)), [route.data, markers]);

  if (!draft.origin || !draft.destination) return <Redirect href="/trip/plan" />;
  if (!draft.mode) return <Redirect href="/trip/mode" />;
  const m = modeMeta(draft.mode);
  const routeCode = errorCode(route.error);

  const startGps = async () => {
    setDialog(null);
    setBusy(true);
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
      setBusy(false);
    }
  };

  const submitPlanned = async () => {
    setDialog(null);
    setBusy(true);
    const trip = await draft.submitPlanned();
    setBusy(false);
    if (trip) {
      router.replace('/trip/result');
      return;
    }
    if (errorCode(draft.uploadError) === 'ROUTE_TOKEN_INVALID') void route.refetch();
  };

  const plannedError = draft.recording.status === 'error' && draft.uploadError ? draft.uploadError : null;

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label="Iniciar viaje con GPS" icon="navigate" loading={busy && dialog === null && !plannedError} onPress={() => setDialog('gps')} testID="confirm-start" />
          <Button
            label="Ya hice este viaje"
            icon="checkmark-done"
            variant="secondary"
            disabled={!route.data || busy}
            onPress={() => setDialog('planned')}
          />
        </View>
      }
    >
      <View style={{ height: 200, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.lg }}>
        <EcoMap tripMarkers={markers} routeLines={lines} fitTo={fitTo} accessibilityLabel="Vista previa del trayecto" />
      </View>

      {routeCode === 'ROUTING_UNAVAILABLE' || routeCode === 'NETWORK_ERROR' ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner tone="warning" message="El cálculo de rutas no está disponible: mostramos una estimación en línea recta. Puedes registrar el viaje con GPS." />
        </View>
      ) : route.isError ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner tone="danger" message={getErrorMessage(route.error)} />
        </View>
      ) : null}
      {plannedError ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner
            tone="danger"
            message={draft.savedLocally ? `${getErrorMessage(plannedError)} Lo verás en Viajes pendientes.` : getErrorMessage(plannedError)}
          />
        </View>
      ) : null}

      <Card>
        <Stop color={colors.primary} letter="A" title="Origen" label={draft.origin.label} />
        <View style={{ marginLeft: 13, width: 2, height: 16, backgroundColor: colors.border }} />
        <Stop color={colors.info} letter="B" title="Destino" label={draft.destination.label} />
        <View style={{ marginVertical: spacing.md }}>
          <Divider />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <ModeBadge mode={draft.mode} />
            {vehicle ? (
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} · {vehicle.occupants} {vehicle.occupants === 1 ? 'persona' : 'personas'}
              </AppText>
            ) : null}
          </View>
          {route.isPending && route.fetchStatus !== 'idle' ? (
            <Skeleton width={90} height={18} />
          ) : (
            <AppText variant="bodyStrong">
              {route.data ? `${formatDistance(route.data.distance_m)} · ${formatDuration(route.data.duration_s)}` : `≈ ${formatDistance(approx ?? 0)}`}
            </AppText>
          )}
        </View>
      </Card>

      <AppText variant="subtitle" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Impacto estimado
      </AppText>
      <Card>
        {estimates.isPending && estimates.fetchStatus !== 'idle' ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} style={{ marginTop: spacing.md }} />
            <Skeleton height={44} style={{ marginTop: spacing.md }} />
          </>
        ) : estimates.isError ? (
          <Banner tone="warning" message={estimateErrorMessage(estimates.error)} />
        ) : estimate ? (
          <>
            <Co2Comparison carG={estimate.co2_emitted_g + estimate.co2_saved_g} modeG={estimate.co2_emitted_g} savedG={estimate.co2_saved_g} modeLabel={m.label} />
            {vehicle ? (
              <AppText variant="bodyStrong" tone="primary" style={{ marginTop: spacing.md }}>
                Ahorras {formatCo2(estimate.co2_saved_g)} frente a ir solo
              </AppText>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }}>
              <Ionicons name="star" size={18} color={colors.warning} />
              <AppText variant="bodyStrong" style={{ marginLeft: spacing.sm }}>
                +{estimate.points_estimate} puntos estimados
              </AppText>
            </View>
          </>
        ) : null}
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Banner
          tone="info"
          message="«Iniciar viaje con GPS» graba tu ruta real con la app abierta. «Ya hice este viaje» registra la ruta calculada, terminando ahora. El servidor calcula la distancia, el CO₂ y los puntos finales."
        />
      </View>

      <ConfirmDialog
        visible={dialog === 'gps'}
        title="¿Iniciar el viaje?"
        message={`Registraremos tu trayecto en ${m.label.toLowerCase()} con GPS. Podrás pausarlo o terminarlo cuando llegues.`}
        confirmLabel="Iniciar"
        onConfirm={() => void startGps()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === 'planned'}
        title="¿Registrar viaje ya realizado?"
        message={
          route.data
            ? `Guardaremos la ruta calculada (${formatDistance(route.data.distance_m)}) en ${m.label.toLowerCase()}, con llegada ahora y una duración de ${formatDuration(route.data.duration_s)}.`
            : ''
        }
        confirmLabel="Registrar"
        loading={busy}
        onConfirm={() => void submitPlanned()}
        onCancel={() => setDialog(null)}
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
