import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { AppText, Card, ComingSoonState, Screen } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const PREVIEW = [
  { icon: 'bicycle' as const, title: 'Primer pedaleo', body: 'Tu primer viaje en bicicleta.' },
  { icon: 'walk' as const, title: 'Paso a paso', body: 'Caminatas acumuladas.' },
  { icon: 'bus' as const, title: 'Usuario frecuente', body: 'Viajes en transporte público.' },
  { icon: 'leaf' as const, title: 'Guardián del aire', body: 'Metas de CO₂ evitado.' },
];

/**
 * Pantalla 16 — Logros y recompensas.
 * Depende de endpoints de gamificación aún no aprobados (docs/proposals/2026-11-15-mobile-gamification.md).
 * No se calculan logros en el cliente (ADR-002) ni se muestran datos simulados.
 */
export default function AchievementsScreen() {
  const { colors, spacing } = useTheme();
  return (
    <Screen>
      <ComingSoonState
        title="Logros en preparación"
        message="Muy pronto ganarás insignias y recompensas por tus viajes sostenibles. Los viajes que registres hoy contarán cuando se active."
      />
      <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
        Lo que viene
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {PREVIEW.map((p) => (
          <Card key={p.title} style={{ flexBasis: '47%', flexGrow: 1, alignItems: 'center', opacity: 0.75 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={p.icon} size={28} color={colors.textMuted} />
            </View>
            <AppText variant="bodyStrong" align="center" style={{ marginTop: spacing.sm }}>
              {p.title}
            </AppText>
            <AppText variant="caption" tone="muted" align="center">
              {p.body}
            </AppText>
            <Ionicons name="lock-closed" size={14} color={colors.textMuted} style={{ marginTop: spacing.sm }} accessibilityLabel="Bloqueado" />
          </Card>
        ))}
      </View>
    </Screen>
  );
}
