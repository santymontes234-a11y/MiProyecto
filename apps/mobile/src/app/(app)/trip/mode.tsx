import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCo2 } from '@ecomove/shared';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { AppText, Button, FadeIn, IconBubble, Screen, Skeleton } from '@/components/ui';
import { modeMeta, SUSTAINABLE_MODES, type SustainableMode } from '@/features/trips/modes';
import { useTripDraft } from '@/features/trips/TripDraftProvider';
import { useEstimates } from '@/features/trips/useTrips';
import { getErrorMessage } from '@/lib/errors';
import { haversineM } from '@/lib/geo';
import { withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 9 — Selección del medio de transporte con estimación de CO₂ por modo (de la API). */
export default function ModeScreen() {
  const { colors, spacing, radius } = useTheme();
  const draft = useTripDraft();
  const distance = draft.origin && draft.destination ? haversineM(draft.origin.coord, draft.destination.coord) : null;
  const estimates = useEstimates(distance, SUSTAINABLE_MODES);

  if (!draft.origin || !draft.destination) return <Redirect href="/trip/plan" />;

  const firstError = estimates.find((q) => q.isError)?.error;

  const select = (mode: SustainableMode) => {
    void Haptics.selectionAsync();
    draft.setMode(mode);
  };

  return (
    <Screen
      footer={<Button label="Continuar" icon="arrow-forward" disabled={!draft.mode} onPress={() => router.push('/trip/confirm')} />}
    >
      <AppText variant="title">¿Cómo te vas a mover?</AppText>
      <AppText tone="muted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        Compara cuánto CO₂ evitas frente a hacer el mismo trayecto en automóvil.
      </AppText>
      {firstError ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" message={`No pudimos calcular las estimaciones: ${getErrorMessage(firstError)}`} />
        </View>
      ) : null}
      <View accessibilityRole="radiogroup" style={{ gap: spacing.md }}>
        {SUSTAINABLE_MODES.map((mode, i) => {
          const m = modeMeta(mode);
          const q = estimates[i];
          const selected = draft.mode === mode;
          return (
            <FadeIn key={mode} delay={i * 60}>
              <Pressable
                onPress={() => select(mode)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${m.label}. ${m.description}.${q?.data ? ` Evitas ${formatCo2(q.data.co2_saved_g)} de CO2.` : ''}`}
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
                  {q?.isPending && distance ? (
                    <Skeleton width={64} height={18} />
                  ) : q?.data ? (
                    <>
                      <AppText variant="bodyStrong" tone="primary">
                        −{formatCo2(q.data.co2_saved_g)}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        CO₂ evitado
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
      <AppText variant="caption" tone="muted" style={{ marginTop: spacing.lg }}>
        Estimación con la distancia en línea recta entre origen y destino. El CO₂ definitivo se calcula con la ruta GPS real al terminar el viaje.
      </AppText>
    </Screen>
  );
}
