import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCo2 } from '@ecomove/shared';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { VehiclePicker } from '@/components/trips/VehiclePicker';
import { AppText, Button, FadeIn, IconBubble, Screen, Skeleton } from '@/components/ui';
import { modeMeta, SUSTAINABLE_MODES, type SustainableMode } from '@/features/trips/modes';
import { useTripDraft } from '@/features/trips/TripDraftProvider';
import { estimateErrorMessage, useEstimates, useRoute } from '@/features/trips/useTrips';
import { DEFAULT_VEHICLE, defaultOccupants, usePreferences, usesVehicle } from '@/features/trips/vehicle';
import { haversineM } from '@/lib/geo';
import { withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 9 — Selección del medio de transporte con CO₂ y puntos estimados por la API (batch). */
export default function ModeScreen() {
  const { colors, spacing, radius } = useTheme();
  const draft = useTripDraft();
  const origin = draft.origin?.coord ?? null;
  const destination = draft.destination?.coord ?? null;
  // Distancia de referencia: ruta real en bici (misma consulta cacheada que en el paso anterior) o línea recta.
  const preview = useRoute(origin, destination, 'BICYCLE');
  const approx = origin && destination ? haversineM(origin, destination) : null;
  const distanceM = preview.data?.distance_m ?? (preview.isPending && preview.fetchStatus !== 'idle' ? null : approx);
  const prefs = usePreferences();
  const { mode: selectedMode, vehicle, setVehicle } = draft;
  const needsVehicle = usesVehicle(selectedMode);
  const estimates = useEstimates({ distanceM, vehicle: needsVehicle ? vehicle : null }, SUSTAINABLE_MODES);


  if (!draft.origin || !draft.destination) return <Redirect href="/trip/plan" />;

  const select = (mode: SustainableMode) => {
    void Haptics.selectionAsync();
    draft.setMode(mode);
    draft.setPlannedRoute(null);
    // O4/O5: al elegir un medio en auto se propone el vehículo por defecto del usuario (o Sedán).
    if (!usesVehicle(mode)) setVehicle(null);
    else if (!vehicle || mode !== selectedMode) {
      setVehicle({ vehicle_type: vehicle?.vehicle_type ?? prefs.data?.default_vehicle_type ?? DEFAULT_VEHICLE, occupants: defaultOccupants(mode) });
    }
  };

  return (
    <Screen footer={<Button label="Continuar" icon="arrow-forward" disabled={!draft.mode} onPress={() => router.push('/trip/confirm')} />}>
      <AppText variant="title">¿Cómo te vas a mover?</AppText>
      <AppText tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        Compara cuánto CO₂ evitas frente a hacer el mismo trayecto en automóvil.
      </AppText>
      {estimates.isError ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="warning" message={estimateErrorMessage(estimates.error)} />
        </View>
      ) : null}
      <View accessibilityRole="radiogroup" style={{ gap: spacing.md }}>
        {SUSTAINABLE_MODES.map((mode, i) => {
          const m = modeMeta(mode);
          const e = estimates.data?.[mode];
          const selected = draft.mode === mode;
          return (
            <FadeIn key={mode} delay={i * 60}>
              <Pressable
                onPress={() => select(mode)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${m.label}. ${m.description}.${e ? ` Evitas ${formatCo2(e.co2_saved_g)} de CO2 y ganas ${e.points_estimate} puntos.` : ''}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: spacing.lg,
                  borderRadius: radius.lg,
                  borderWidth: 2,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <IconBubble icon={m.icon} color={m.color} bg={withAlpha(m.color, 0.14)} size={48} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <AppText variant="bodyStrong">{m.label}</AppText>
                  <AppText variant="caption" tone="muted">
                    {m.description}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end', minWidth: 84 }}>
                  {estimates.isPending && distanceM ? (
                    <Skeleton width={64} height={18} />
                  ) : e ? (
                    <>
                      <AppText variant="bodyStrong" tone="primary">
                        −{formatCo2(e.co2_saved_g)}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        +{e.points_estimate} pts
                      </AppText>
                    </>
                  ) : (
                    <AppText variant="caption" tone="muted">
                      —
                    </AppText>
                  )}
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={{ marginLeft: spacing.sm }} /> : null}
              </Pressable>
            </FadeIn>
          );
        })}
      </View>
      {needsVehicle && selectedMode && vehicle ? (
        <FadeIn style={{ marginTop: spacing.lg }}>
          <VehiclePicker mode={selectedMode} value={vehicle} onChange={setVehicle} />
        </FadeIn>
      ) : null}
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.lg }}>
        {preview.data
          ? 'Estimación con la ruta calculada para bicicleta. En el siguiente paso verás la ruta exacta del medio elegido.'
          : 'Estimación con la distancia en línea recta (el cálculo de rutas no está disponible ahora).'}
      </AppText>
    </Screen>
  );
}
