import Ionicons from '@expo/vector-icons/Ionicons';
import { ApiError, formatDistance, map as mapTokens, type Place as ApiPlace, type Position } from '@ecomove/shared';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Linking, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EcoMap } from '@/components/map/EcoMap';
import type { MapLine, MapMarker } from '@/components/map/map-protocol';
import { AppText, Button, useToast } from '@/components/ui';
import { useInfrastructure } from '@/features/map/useInfrastructure';
import { placeFromApi, usePlaceSearch, useRecentPlaces } from '@/features/places/usePlaceSearch';
import { useTripDraft, type Place } from '@/features/trips/TripDraftProvider';
import { useRoute } from '@/features/trips/useTrips';
import { errorCode, getErrorMessage } from '@/lib/errors';
import { formatCoord, haversineM } from '@/lib/geo';
import { ensureForegroundPermission, getCurrentPosition } from '@/lib/location';
import { useTheme } from '@/theme/ThemeProvider';

type Target = 'origin' | 'destination';

/** Pantalla 8 — Origen y destino: búsqueda por texto (O2, GET /geocode) o tocando el mapa. */
export default function PlanScreen() {
  const { colors, spacing, radius, elevation } = useTheme();
  const toast = useToast();
  const draft = useTripDraft();
  const infra = useInfrastructure([]);
  const [target, setTarget] = useState<Target>(draft.origin ? 'destination' : 'origin');
  const [locating, setLocating] = useState(false);
  const [focused, setFocused] = useState<Target | null>(null);
  const [query, setQuery] = useState('');
  const recentPlaces = useRecentPlaces();
  const near = draft.origin?.coord ?? draft.destination?.coord ?? mapTokens.defaultCenter;
  const search = usePlaceSearch(focused ? query : '', near);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setFocused(null);
    setQuery('');
  }, []);

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

  const choose = useCallback(
    (which: Target, place: Place, remember = true) => {
      assign(which, place);
      if (remember) recentPlaces.remember(place);
      closeSearch();
    },
    [assign, closeSearch, recentPlaces],
  );

  const onTap = useCallback(
    (coord: Position) => {
      assign(target, { coord, label: `Punto en el mapa (${formatCoord(coord)})` });
      closeSearch();
    },
    [assign, target, closeSearch],
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
      closeSearch();
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

  // Ruta real de previsualización (perfil bicicleta). Si el ruteo no está disponible: línea recta.
  const preview = useRoute(draft.origin?.coord ?? null, draft.destination?.coord ?? null, 'BICYCLE');
  const line = useMemo<MapLine[]>(() => {
    if (!draft.origin || !draft.destination) return [];
    if (preview.data) return [{ id: 'plan', coords: preview.data.route.coordinates, color: colors.info, weight: 5 }];
    return [{ id: 'plan', coords: [draft.origin.coord, draft.destination.coord], color: colors.info, weight: 5, dashed: true }];
  }, [draft.origin, draft.destination, colors.info, preview.data]);

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
        <PlaceRow
          which="origin"
          active={target === 'origin'}
          place={draft.origin}
          editing={focused === 'origin'}
          query={query}
          onQuery={setQuery}
          onFocus={() => {
            setTarget('origin');
            setFocused('origin');
            setQuery('');
          }}
        />
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
        <PlaceRow
          which="destination"
          active={target === 'destination'}
          place={draft.destination}
          editing={focused === 'destination'}
          query={query}
          onQuery={setQuery}
          onFocus={() => {
            setTarget('destination');
            setFocused('destination');
            setQuery('');
          }}
        />
        {focused ? (
          <SearchResults
            target={focused}
            query={query}
            search={search}
            recents={recentPlaces.recents}
            locating={locating}
            onMyLocation={() => void pickMyLocation()}
            onPick={(p, remember) => choose(focused, p, remember)}
            onClose={closeSearch}
          />
        ) : (
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
        )}
      </View>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <View style={{ padding: spacing.lg }}>
          {preview.data ? (
            <AppText variant="caption" tone="muted" align="center" style={{ marginBottom: spacing.sm }}>
              Ruta en bici: {formatDistance(preview.data.distance_m)}
            </AppText>
          ) : preview.isFetching ? (
            <AppText variant="caption" tone="muted" align="center" style={{ marginBottom: spacing.sm }}>
              Calculando ruta…
            </AppText>
          ) : straightM !== null ? (
            <AppText variant="caption" tone="muted" align="center" style={{ marginBottom: spacing.sm }}>
              {errorCode(preview.error) === 'TRIP_OUTSIDE_SERVICE_AREA'
                ? 'Uno de los puntos está fuera del área de servicio de Querétaro.'
                : `Distancia aproximada en línea recta: ${formatDistance(straightM)}`}
            </AppText>
          ) : (
            <AppText variant="caption" tone="muted" align="center" style={{ marginBottom: spacing.sm }}>
              Busca un lugar o toca el mapa para colocar el {target === 'origin' ? 'origen (A)' : 'destino (B)'}.
            </AppText>
          )}
          {tooShort ? (
            <AppText variant="caption" tone="danger" align="center" style={{ marginBottom: spacing.sm }}>
              El origen y el destino están demasiado cerca.
            </AppText>
          ) : null}
          <Button label="Elegir transporte" icon="arrow-forward" disabled={!draft.origin || !draft.destination || tooShort || errorCode(preview.error) === 'TRIP_OUTSIDE_SERVICE_AREA'} onPress={() => router.push('/trip/mode')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

interface PlaceRowProps {
  which: Target;
  place: Place | null;
  active: boolean;
  editing: boolean;
  query: string;
  onQuery: (q: string) => void;
  onFocus: () => void;
}

function PlaceRow({ which, place, active, editing, query, onQuery, onFocus }: PlaceRowProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const inputRef = useRef<TextInputInstance>(null);
  const color = which === 'origin' ? colors.primary : colors.info;
  const title = which === 'origin' ? 'Origen' : 'Destino';
  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessible={false}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.xs,
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
        <TextInput
          ref={inputRef}
          value={editing ? query : (place?.label ?? '')}
          onChangeText={onQuery}
          onFocus={onFocus}
          placeholder={editing ? 'Escribe un lugar, p. ej. «UPQ»' : 'Busca un lugar o toca el mapa'}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={`${title}: ${place?.label ?? 'sin seleccionar'}. Escribe para buscar un lugar`}
          autoCorrect={false}
          returnKeyType="search"
          maxLength={120}
          numberOfLines={1}
          style={[typography.body, { color: colors.text, paddingVertical: 2, minHeight: 32 }]}
        />
      </View>
    </Pressable>
  );
}

interface SearchResultsProps {
  target: Target;
  query: string;
  search: ReturnType<typeof usePlaceSearch>;
  recents: Place[];
  locating: boolean;
  onMyLocation: () => void;
  onPick: (p: Place, remember: boolean) => void;
  onClose: () => void;
}

const CATEGORY_ICON: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  BUS_STOP: 'bus',
  BIKE_PARKING: 'bicycle',
  BIKE_SHARING: 'bicycle',
  university: 'school',
  school: 'school',
  hospital: 'medkit',
};

function searchErrorMessage(e: unknown): string {
  // 404: el backend aún no publica /geocode (contrato 1.2). Se sigue pudiendo tocar el mapa.
  if (e instanceof ApiError && e.status === 404) return 'La búsqueda de lugares aún no está disponible. Toca el mapa para elegir el punto.';
  return getErrorMessage(e);
}

function SearchResults({ target, query, search, recents, locating, onMyLocation, onPick, onClose }: SearchResultsProps) {
  const { colors, spacing } = useTheme();
  const short = query.trim().length < 2;

  const row = (key: string, icon: ComponentProps<typeof Ionicons>['name'], title: string, subtitle: string | null, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: spacing.sm, opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );

  let body: ReactNode;
  if (short) {
    body = (
      <>
        {target === 'origin'
          ? row('me', 'locate', locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación', null, onMyLocation)
          : null}
        {recents.length ? (
          <AppText variant="overline" tone="muted" style={{ marginTop: spacing.sm, marginLeft: spacing.sm }}>
            BÚSQUEDAS RECIENTES
          </AppText>
        ) : null}
        {recents.map((p, i) => row(`r${i}`, 'time-outline', p.label, null, () => onPick(p, true)))}
        {!recents.length && target === 'destination' ? (
          <AppText variant="caption" tone="muted" style={{ padding: spacing.sm }}>
            Escribe al menos 2 letras o toca el mapa.
          </AppText>
        ) : null}
      </>
    );
  } else if (search.isError) {
    body = (
      <AppText variant="caption" tone="danger" style={{ padding: spacing.sm }}>
        {searchErrorMessage(search.error)}
      </AppText>
    );
  } else if (search.debouncing || search.isFetching) {
    body = (
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.sm }}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="caption" tone="muted" style={{ marginLeft: spacing.sm }}>
          Buscando…
        </AppText>
      </View>
    );
  } else if (!search.items.length) {
    body = (
      <AppText variant="caption" tone="muted" style={{ padding: spacing.sm }}>
        Sin resultados para «{query.trim()}». Prueba otro nombre o toca el mapa.
      </AppText>
    );
  } else {
    body = search.items.map((p: ApiPlace, i) =>
      row(`s${i}`, (p.category && CATEGORY_ICON[p.category]) || (p.source === 'poi' ? 'leaf' : 'location'), p.name, p.label !== p.name ? p.label : null, () => onPick(placeFromApi(p), true)),
    );
  }

  return (
    <View style={{ marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
      <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar búsqueda y elegir en el mapa" style={{ alignSelf: 'flex-end', padding: spacing.sm }}>
        <AppText variant="label" tone="primary">
          Elegir en el mapa
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, left: 0, right: 0 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
