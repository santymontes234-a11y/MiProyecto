import Ionicons from '@expo/vector-icons/Ionicons';
import { POI_CATEGORIES, type PoiFeature, type Position } from '@ecomove/shared';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EcoMap, type EcoMapHandle } from '@/components/map/EcoMap';
import type { MapMarker } from '@/components/map/map-protocol';
import { AppText, Button, Chip, IconBubble, useToast } from '@/components/ui';
import { POI_ICONS, poiColor, useInfrastructure } from '@/features/map/useInfrastructure';
import { useTripDraft } from '@/features/trips/TripDraftProvider';
import { getErrorMessage } from '@/lib/errors';
import { formatCoord } from '@/lib/geo';
import { ensureForegroundPermission, getCurrentPosition } from '@/lib/location';
import { withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 7 — Mapa interactivo de Querétaro con infraestructura sostenible. */
export default function MapScreen() {
  const { colors, spacing, radius, elevation } = useTheme();
  const toast = useToast();
  const mapRef = useRef<EcoMapHandle>(null);
  const infra = useInfrastructure();
  const draft = useTripDraft();
  const [user, setUser] = useState<MapMarker | null>(null);
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState<PoiFeature | null>(null);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const perm = await ensureForegroundPermission();
      if (perm !== 'granted') {
        toast.info(perm === 'blocked' ? 'Activa el permiso de ubicación en Ajustes.' : 'Necesitamos tu ubicación para centrarte en el mapa.');
        if (perm === 'blocked') void Linking.openSettings();
        return;
      }
      const pos = await getCurrentPosition();
      if (!pos) {
        toast.error('Activa el GPS de tu dispositivo.');
        return;
      }
      setUser({ id: 'me', coord: pos, kind: 'user', label: 'Tu ubicación' });
      mapRef.current?.setView(pos, 16);
    } catch {
      toast.error('No pudimos obtener tu ubicación.');
    } finally {
      setLocating(false);
    }
  }, [toast]);

  const goFrom = (coord: Position, label: string) => {
    draft.setOrigin({ coord, label });
    setSelected(null);
    router.push('/trip/plan');
  };
  const goTo = (coord: Position, label: string) => {
    draft.setDestination({ coord, label });
    setSelected(null);
    router.push('/trip/plan');
  };

  return (
    <View style={{ flex: 1 }}>
      <EcoMap
        ref={mapRef}
        poiMarkers={infra.poiMarkers}
        cyclewayLines={infra.cyclewayLines}
        userMarker={user}
        onMoveEnd={infra.onMoveEnd}
        onMarkerPress={(id, layer) => {
          if (layer !== 'pois') return;
          const poi = infra.findPoi(id);
          if (poi) setSelected(poi);
        }}
      />

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderRadius: radius.lg, ...elevation.card }]}>
          <Ionicons name="leaf" size={20} color={colors.primary} />
          <AppText variant="bodyStrong" style={{ flex: 1, marginLeft: spacing.sm }}>
            Infraestructura sostenible
          </AppText>
          {infra.loading ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }}>
          <View style={{ backgroundColor: colors.background, borderRadius: radius.pill }}>
            <Chip label="Ciclovías" icon="bicycle" selected={infra.showCycleways} onPress={() => infra.setShowCycleways(!infra.showCycleways)} />
          </View>
          {POI_CATEGORIES.map((c) => (
            <View key={c} style={{ backgroundColor: colors.background, borderRadius: radius.pill }}>
              <Chip label={infra.categoryLabel(c)} icon={POI_ICONS[c]} selected={infra.categories.includes(c)} onPress={() => infra.toggleCategory(c)} />
            </View>
          ))}
        </ScrollView>
        {infra.tooFar ? <Hint text="Acerca el mapa para ver ciclovías y puntos de interés." /> : null}
        {infra.error ? <Hint text={getErrorMessage(infra.error)} danger /> : null}
        {infra.empty ? <Hint text="No hay infraestructura registrada en esta zona todavía." /> : null}
      </SafeAreaView>

      <View style={[styles.fabs, { right: spacing.lg, bottom: spacing.xl }]}>
        <Pressable
          onPress={() => void locate()}
          accessibilityRole="button"
          accessibilityLabel="Centrar en mi ubicación"
          style={[styles.fab, { backgroundColor: colors.surface, ...elevation.card }]}
        >
          {locating ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="locate" size={24} color={colors.primary} />}
        </Pressable>
      </View>
      <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg + 64, bottom: spacing.xl }}>
        <Button label="Planear viaje" icon="navigate" onPress={() => router.push('/trip/plan')} />
      </View>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setSelected(null)} accessibilityLabel="Cerrar detalle" />
        {selected ? (
          <View style={[styles.sheet, { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconBubble
                icon={POI_ICONS[selected.properties.category]}
                color={poiColor(selected.properties.category, colors)}
                bg={withAlpha(poiColor(selected.properties.category, colors), 0.14)}
              />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <AppText variant="subtitle">{selected.properties.name}</AppText>
                <AppText variant="caption" tone="muted">
                  {infra.categoryLabel(selected.properties.category)}
                </AppText>
              </View>
            </View>
            {selected.properties.description ? <AppText style={{ marginTop: spacing.md }}>{selected.properties.description}</AppText> : null}
            <PoiAttributes attributes={selected.properties.attributes} />
            <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
              {formatCoord(selected.geometry.coordinates)}
            </AppText>
            <Button
              label="Reportar un problema aquí"
              icon="megaphone-outline"
              variant="ghost"
              size="md"
              style={{ marginTop: spacing.md }}
              onPress={() => {
                const [lng, lat] = selected.geometry.coordinates;
                setSelected(null);
                router.push({ pathname: '/report', params: { lng: String(lng), lat: String(lat), poi_id: selected.id, poi_name: selected.properties.name } });
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button label="Salir de aquí" variant="secondary" fullWidth={false} style={{ flex: 1 }} onPress={() => goFrom(selected.geometry.coordinates, selected.properties.name)} />
              <Button label="Ir aquí" fullWidth={false} style={{ flex: 1 }} onPress={() => goTo(selected.geometry.coordinates, selected.properties.name)} />
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

function Hint({ text, danger = false }: { text: string; danger?: boolean }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: 'center',
        backgroundColor: danger ? colors.danger : colors.surface,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        marginTop: spacing.xs,
        borderWidth: danger ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <AppText variant="caption" style={{ color: danger ? colors.onPrimary : colors.text }}>
        {text}
      </AppText>
    </View>
  );
}

// Contrato 1.1.1 §5.1: `code` = código oficial (solo si un admin lo asigna); `ref` = referencia OSM (no única).
const ATTRIBUTE_LABELS: Record<string, string> = {
  code: 'Código oficial',
  ref: 'Referencia',
  lines: 'Líneas',
  capacity: 'Capacidad',
  covered: 'Techado',
  operator: 'Operador',
  opening_hours: 'Horario',
};
const HIDDEN_ATTRIBUTES = new Set(['source', 'osm_id']);

function PoiAttributes({ attributes }: { attributes: Record<string, unknown> }) {
  const { spacing } = useTheme();
  const entries = Object.entries(attributes)
    .filter(([k]) => !HIDDEN_ATTRIBUTES.has(k))
    .map(([k, v]): [string, unknown] => [k, Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : v])
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v) && v !== '');
  if (!entries.length) return null;
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
      {entries.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row' }}>
          <AppText variant="caption" tone="muted" style={{ width: 120 }}>
            {ATTRIBUTE_LABELS[k] ?? k}
          </AppText>
          <AppText variant="caption">{typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v)}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, paddingHorizontal: 16, minHeight: 52 },
  fabs: { position: 'absolute' },
  fab: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
