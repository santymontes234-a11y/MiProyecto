import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDistance, type Position } from '@ecomove/shared';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EcoMap } from '@/components/map/EcoMap';
import type { MapLine, MapMarker } from '@/components/map/map-protocol';
import { AppText, Button, useToast } from '@/components/ui';
import { useInfrastructure } from '@/features/map/useInfrastructure';
import { useTripDraft, type Place } from '@/features/trips/TripDraftProvider';
import { formatCoord, haversineM } from '@/lib/geo';
import { ensureForegroundPermission, getCurrentPosition } from '@/lib/location';
import { useTheme } from '@/theme/ThemeProvider';

type Target = 'origin' | 'destination';

/** Pantalla 8 — Selección de origen y destino tocando el mapa. */
export default function PlanScreen() {
  const { colors, spacing, radius, elevation } = useTheme();
  const toast = useToast();
  const draft = useTripDraft();
  const infra = useInfrastructure([]);
  const [target, setTarget] = useState<Target>(draft.origin ? 'destination' : 'origin');
  const [locating, setLocating] = useState(false);

  const assign = useCallback(
    (which: Target, place: Place) => {
      if (which === 'origin') {
        draft.setOrigin(place);
        if (!draft.destination) setTarget('destination');
      } else {
        draft.setDestination(place);
      }
    },
    [draft],
  );

  const onTap = useCallback(
    (coord: Position) => {
      assign(target, { coord, label: `Punto en el mapa (${formatCoord(coord)})` });
    },
    [assign, target],
  );

  const pickMyLocation = async () => {
    setLocating(true);
    try {
      const perm = await ensureForegroundPermission();
      if (perm !== 'granted') {
        toast.info('Permite el acceso a tu ubicación para usarla como origen.');
        if (perm === 'blocked') void Linking.openSettings();
        return;
      }
      const pos = await getCurrentPosition();
      if (!pos) {
        toast.error('Activa el GPS de tu dispositivo.');
        return;
      }
      assign('origin', { coord: pos, label: 'Mi ubicación' });
    } catch {
      toast.error('No pudimos obtener tu ubicación.');
    } finally {
      setLocating(false);
    }
  };

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (draft.origin) m.push({ id: 'origin', coord: draft.origin.coord, kind: 'origin', label: 'Origen' });
    if (draft.destination) m.push({ id: 'destination', coord: draft.destination.coord, kind: 'destination', label: 'Destino' });
    return m;
  }, [draft.origin, draft.destination]);

  const line = useMemo<MapLine[]>(
    () =>
      draft.origin && draft.destination
        ? [{ id: 'plan', coords: [draft.origin.coord, draft.destination.coord], color: colors.info, weight: 5, dashed: true }]
        : [],
    [draft.origin, draft.destination, colors.info],
  );

  const fitTo = useMemo(() => (draft.origin && draft.destination ? [draft.origin.coord, draft.destination.coord] : null), [draft.origin, draft.destination]);

  const straightM = draft.origin && draft.destination ? haversineM(draft.origin.coord, draft.destination.coord) : null;
  const tooShort = straightM !== null && straightM < 100;

  return (
    <View style={{ flex: 1 }}>
      <EcoMap
        tripMarkers={markers}
        routeLines={line}
        cyclewayLines={infra.cyclewayLines}
        onMoveEnd={infra.onMoveEnd}
        onTap={onTap}
        fitTo={fitTo}
        accessibilityLabel="Mapa para elegir origen y destino. Toca el mapa para colocar el punto seleccionado."
      />

      <View style={[styles.panel, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, margin: spacing.lg, ...elevation.card }]}>
        <PlaceRow which="origin" active={target === 'origin'} place={draft.origin} onPress={() => setTarget('origin')} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 40 }} />
          <Pressable
            onPress={draft.swapPlaces}
            accessibilityRole="button"
            accessibilityLabel="Intercambiar origen y destino"
            hitSlop={8}
            style={{ padding: spacing.xs, marginLeft: spacing.sm }}
          >
            <Ionicons name="swap-vertical" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <PlaceRow which="destination" active={target === 'destination'} place={draft.destination} onPress={() => setTarget('destination')} />
        <Pressable
          onPress={() => void pickMyLocation()}
          accessibilityRole="button"
          accessibilityLabel="Usar mi ubicación como origen"
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, minHeight: 40 }}
        >
          {locating ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="locate" size={18} color={colors.primaryText} />}
          <AppText variant="label" tone="primary" style={{ marginLeft: spacing.sm }}>
            Usar mi ubicación como origen
          </AppText>
        </Pressable>
      </View>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <View style={{ padding: spacing.lg }}>
          {straightM !== null ? (
            <AppText variant="caption" tone="muted" align="center" style={{ marginBottom: spacing.sm }}>
              Distancia aproximada en línea recta: {formatDistance(straightM)}
            </AppText>
          ) : (
            <AppText variant="caption" tone="muted" align="center" style={{ marginBottom: spacing.sm }}>
              Toca el mapa para colocar el {target === 'origin' ? 'origen (A)' : 'destino (B)'}.
            </AppText>
          )}
          {tooShort ? (
            <AppText variant="caption" tone="danger" align="center" style={{ marginBottom: spacing.sm }}>
              El origen y el destino están demasiado cerca.
            </AppText>
          ) : null}
          <Button label="Elegir transporte" icon="arrow-forward" disabled={!draft.origin || !draft.destination || tooShort} onPress={() => router.push('/trip/mode')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function PlaceRow({ which, place, active, onPress }: { which: Target; place: Place | null; active: boolean; onPress: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const color = which === 'origin' ? colors.primary : colors.info;
  const title = which === 'origin' ? 'Origen' : 'Destino';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${title}: ${place?.label ?? 'sin seleccionar'}. ${active ? 'Seleccionado para colocar en el mapa' : 'Toca para seleccionarlo'}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: active ? colors.primarySoft : 'transparent',
      }}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="overline" style={{ color: colors.onPrimary }}>
          {which === 'origin' ? 'A' : 'B'}
        </AppText>
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <AppText variant="overline" tone="muted">
          {title.toUpperCase()}
        </AppText>
        <AppText variant="body" numberOfLines={1} tone={place ? 'default' : 'muted'}>
          {place?.label ?? (active ? 'Toca el mapa…' : 'Sin seleccionar')}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, left: 0, right: 0 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
