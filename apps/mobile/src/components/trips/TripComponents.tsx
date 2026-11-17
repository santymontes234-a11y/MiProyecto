import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCo2, formatDistance, formatDuration, type TransportMode, type TripSummary } from '@ecomove/shared';
import { View } from 'react-native';

import { AppText, Card, IconBubble } from '@/components/ui';
import { modeMeta } from '@/features/trips/modes';
import { formatDateTime, formatRelativeDay } from '@/lib/format';
import { withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function ModeBadge({ mode, size = 'md' }: { mode: TransportMode; size?: 'sm' | 'md' }) {
  const { spacing, radius } = useTheme();
  const m = modeMeta(mode);
  return (
    <View
      accessible
      accessibilityLabel={`Modo: ${m.label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: withAlpha(m.color, 0.14),
        borderRadius: radius.pill,
        paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md,
        paddingVertical: size === 'sm' ? 2 : spacing.xs,
      }}
    >
      <Ionicons name={m.icon} size={size === 'sm' ? 14 : 16} color={m.color} />
      <AppText variant="label" style={{ marginLeft: spacing.xs, color: m.color }}>
        {m.label}
      </AppText>
    </View>
  );
}

export function TripCard({ trip, onPress }: { trip: TripSummary; onPress?: () => void }) {
  const { spacing } = useTheme();
  const m = modeMeta(trip.mode);
  const cancelled = trip.status === 'CANCELLED';
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Viaje en ${m.label}, ${formatRelativeDay(trip.started_at)}, ${formatDistance(trip.distance_m)}, ${formatCo2(trip.co2_saved_g)} de CO2 evitado`}
      style={{ marginBottom: spacing.md }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconBubble icon={m.icon} color={m.color} bg={withAlpha(m.color, 0.14)} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <AppText variant="bodyStrong">{m.label}</AppText>
          <AppText variant="caption" tone="muted">
            {formatDateTime(trip.started_at)} · {formatDuration(trip.duration_s)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="bodyStrong" tone="primary">
            {cancelled ? 'Cancelado' : `−${formatCo2(trip.co2_saved_g)}`}
          </AppText>
          <AppText variant="caption" tone="muted">
            {formatDistance(trip.distance_m)}
            {trip.points > 0 ? ` · +${trip.points} pts` : ''}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

interface Co2ComparisonProps {
  carG: number;
  modeG: number;
  savedG: number;
  modeLabel: string;
}

/** Barras comparativas: automóvil vs. modo elegido, y CO₂ evitado. Todas las cifras vienen de la API. */
function Co2Row({ label, value, max, color, icon }: { label: string; value: number; max: number; color: string; icon: 'car' | 'leaf' }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }} accessible accessibilityLabel={`${label}: ${formatCo2(value)} de CO2`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name={icon} size={16} color={color} />
          <AppText variant="label" tone="muted" style={{ marginLeft: spacing.xs }}>
            {label}
          </AppText>
        </View>
        <AppText variant="bodyStrong">{formatCo2(value)}</AppText>
      </View>
      <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(2, (value / max) * 100)}%`, height: '100%', backgroundColor: color, borderRadius: radius.pill }} />
      </View>
    </View>
  );
}

export function Co2Comparison({ carG, modeG, savedG, modeLabel }: Co2ComparisonProps) {
  const { colors, spacing, radius } = useTheme();
  const max = Math.max(carG, modeG, 1);
  return (
    <View>
      <Co2Row label="Si fueras en automóvil" value={carG} max={max} color={colors.danger} icon="car" />
      <Co2Row label={`En ${modeLabel.toLowerCase()}`} value={modeG} max={max} color={colors.primary} icon="leaf" />
      <View
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md }}
        accessible
        accessibilityLabel={`CO2 evitado: ${formatCo2(savedG)}`}
      >
        <Ionicons name="leaf" size={20} color={colors.primaryStrong} />
        <AppText variant="bodyStrong" style={{ marginLeft: spacing.sm, color: colors.primaryStrong, flex: 1 }}>
          CO₂ evitado
        </AppText>
        <AppText variant="subtitle" style={{ color: colors.primaryStrong }}>
          {formatCo2(savedG)}
        </AppText>
      </View>
    </View>
  );
}

export function Banner({ tone = 'info', message, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; message: string; icon?: 'information-circle' | 'warning' | 'alert-circle' | 'checkmark-circle' }) {
  const { colors, spacing, radius } = useTheme();
  const base = { info: colors.info, warning: colors.warning, danger: colors.danger, success: colors.primary }[tone];
  const defaultIcon = { info: 'information-circle', warning: 'warning', danger: 'alert-circle', success: 'checkmark-circle' } as const;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: withAlpha(base, 0.12),
        borderColor: withAlpha(base, 0.4),
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <Ionicons name={icon ?? defaultIcon[tone]} size={20} color={tone === 'warning' ? colors.text : base} />
      <AppText variant="caption" style={{ marginLeft: spacing.sm, flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  display: string;
}

/** Gráfico de barras vertical simple y accesible (sin dependencias nativas). */
export function BarChart({ data, height = 140, color }: { data: BarDatum[]; height?: number; color?: string }) {
  const { colors, spacing, radius } = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View accessibilityRole="image" accessibilityLabel={`Gráfico: ${data.map((d) => `${d.label} ${d.display}`).join(', ')}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: spacing.xs }}>
        {data.map((d) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <View
              style={{
                width: '70%',
                maxWidth: 28,
                height: `${Math.max(2, (d.value / max) * 100)}%`,
                backgroundColor: d.value > 0 ? (color ?? colors.primary) : colors.surfaceAlt,
                borderTopLeftRadius: radius.sm,
                borderTopRightRadius: radius.sm,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
        {data.map((d) => (
          <AppText key={d.key} variant="overline" tone="muted" align="center" style={{ flex: 1, letterSpacing: 0 }} numberOfLines={1}>
            {d.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}
