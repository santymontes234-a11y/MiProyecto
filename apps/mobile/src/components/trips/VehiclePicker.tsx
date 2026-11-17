import Ionicons from '@expo/vector-icons/Ionicons';
import { VEHICLE_TYPE_LABELS, type TransportMode, type VehicleType } from '@ecomove/shared';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { AppText, Card, Chip } from '@/components/ui';
import { clampOccupants, MAX_OCCUPANTS, minOccupants, useVehicleTypes, type VehicleChoice } from '@/features/trips/vehicle';
import { useTheme } from '@/theme/ThemeProvider';

/** O4/O5 — tipo de vehículo y número de ocupantes para CAR/CARPOOL (contrato §4.3). */
export function VehiclePicker({ mode, value, onChange }: { mode: TransportMode; value: VehicleChoice; onChange: (v: VehicleChoice) => void }) {
  const { colors, spacing, radius } = useTheme();
  const { types } = useVehicleTypes();
  const maxFor = (t: VehicleType) => types.find((x) => x.code === t)?.max_occupants ?? MAX_OCCUPANTS;
  const max = Math.min(MAX_OCCUPANTS, maxFor(value.vehicle_type));
  const min = minOccupants(mode);

  const setType = (t: VehicleType) => {
    void Haptics.selectionAsync();
    onChange({ vehicle_type: t, occupants: clampOccupants(mode, value.occupants, maxFor(t)) });
  };
  const step = (d: number) => {
    void Haptics.selectionAsync();
    onChange({ ...value, occupants: clampOccupants(mode, value.occupants + d, maxFor(value.vehicle_type)) });
  };

  const stepButton = (d: number, disabled: boolean) => (
    <Pressable
      onPress={() => step(d)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={d > 0 ? 'Agregar un ocupante' : 'Quitar un ocupante'}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={d > 0 ? 'add' : 'remove'} size={22} color={colors.text} />
    </Pressable>
  );

  return (
    <Card>
      <AppText variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        Tipo de vehículo
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
        {types.map((t) => (
          <Chip key={t.code} label={VEHICLE_TYPE_LABELS[t.code]} icon="car-outline" selected={value.vehicle_type === t.code} onPress={() => setType(t.code)} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">¿Cuántos van en el auto?</AppText>
          <AppText variant="caption" tone="muted">
            {mode === 'CARPOOL' ? 'Incluyéndote; mínimo 2 en carpooling.' : 'Incluyéndote.'}
          </AppText>
        </View>
        {stepButton(-1, value.occupants <= min)}
        <AppText
          variant="title"
          style={{ minWidth: 40, textAlign: 'center' }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${value.occupants} ocupantes`}
        >
          {value.occupants}
        </AppText>
        {stepButton(1, value.occupants >= max)}
      </View>
    </Card>
  );
}
