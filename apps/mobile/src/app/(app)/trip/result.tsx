import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCo2, formatDistance, formatDuration, VEHICLE_TYPE_LABELS } from '@ecomove/shared';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Share, View } from 'react-native';

import { Co2Comparison, ModeBadge } from '@/components/trips/TripComponents';
import { AppText, Button, Card, FadeIn, Screen, StatTile } from '@/components/ui';
import { modeMeta } from '@/features/trips/modes';
import { useTripDraft } from '@/features/trips/TripDraftProvider';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 11 — Resultado: CO₂ evitado según el cálculo del backend. */
export default function ResultScreen() {
  const { colors, spacing, radius } = useTheme();
  const draft = useTripDraft();
  const trip = draft.result;
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) pop.setValue(1);
      else Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 4, tension: 60 }).start();
    });
    if (trip) AccessibilityInfo.announceForAccessibility(`Viaje guardado. Evitaste ${formatCo2(trip.co2_saved_g)} de CO2 y ganaste ${trip.points} puntos.`);
  }, [pop, trip]);

  if (!trip) return <Redirect href="/home" />;
  const m = modeMeta(trip.mode);
  const carG = trip.co2_emitted_g + trip.co2_saved_g;

  const done = () => {
    draft.reset();
    router.replace('/home');
  };
  const viewDetail = () => {
    const id = trip.id;
    draft.reset();
    router.replace({ pathname: '/trips/[id]', params: { id } });
  };

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label="Volver al inicio" onPress={done} />
          <Button label="Ver detalle del viaje" variant="ghost" onPress={viewDetail} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
        <Animated.View style={{ transform: [{ scale: pop }], opacity: pop }}>
          <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="leaf" size={64} color={colors.primary} />
          </View>
        </Animated.View>
        <AppText variant="overline" tone="muted" style={{ marginTop: spacing.lg }}>
          ¡VIAJE GUARDADO!
        </AppText>
        <AppText variant="display" tone="primary" style={{ marginTop: spacing.xs }}>
          {formatCo2(trip.co2_saved_g)}
        </AppText>
        <AppText tone="muted" align="center">
          {trip.occupants ? 'de CO₂ ahorrado frente a ir solo' : 'de CO₂ evitado frente al automóvil'}
        </AppText>
        <View style={{ marginTop: spacing.md }}>
          <ModeBadge mode={trip.mode} />
        </View>
      </View>

      <FadeIn delay={150} style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
        <StatTile icon="navigate" label="Distancia" value={formatDistance(trip.distance_m)} color={colors.accent} />
        <StatTile icon="time" label="Duración" value={formatDuration(trip.duration_s)} color={colors.info} />
      </FadeIn>

      <FadeIn delay={250}>
        <Card style={{ marginTop: spacing.lg }}>
          <Co2Comparison carG={carG} modeG={trip.co2_emitted_g} savedG={trip.co2_saved_g} modeLabel={m.label} />
          {trip.occupants ? (
            <AppText variant="bodyStrong" tone="primary" style={{ marginTop: spacing.md }}>
              Ahorraste {formatCo2(trip.co2_saved_g)} frente a ir solo
              {trip.vehicle_type ? ` en ${VEHICLE_TYPE_LABELS[trip.vehicle_type].toLowerCase()}` : ''} ({trip.occupants} personas).
            </AppText>
          ) : null}
        </Card>
      </FadeIn>

      <FadeIn delay={350}>
        <Card style={{ marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="star" size={22} color={colors.warning} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <AppText variant="bodyStrong">+{trip.points} puntos obtenidos</AppText>
            <AppText variant="caption" tone="muted" onPress={() => router.push('/achievements')}>
              Revisa tu nivel y tus logros en Logros y recompensas.
            </AppText>
          </View>
        </Card>
      </FadeIn>

      <Button
        label="Compartir mi logro"
        icon="share-social"
        variant="outline"
        style={{ marginTop: spacing.lg }}
        onPress={() =>
          void Share.share({
            message: `Hoy evité ${formatCo2(trip.co2_saved_g)} de CO₂ moviéndome en ${m.label.toLowerCase()} por Querétaro con EcoMove 🌱`,
          })
        }
      />
    </Screen>
  );
}
