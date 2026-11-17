import type { Trip, TransportMode, TripStatus } from '@ecomove/shared';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { AppText, Button, Chip } from '@/components/ui';
import { modeMeta, SUSTAINABLE_MODES } from '@/features/trips/modes';
import { useTheme } from '@/theme/ThemeProvider';

export interface EditTripSheetProps {
  trip: Trip;
  visible: boolean;
  saving: boolean;
  error: string | null;
  onSave: (changes: { mode?: TransportMode; status?: TripStatus }) => void;
  onClose: () => void;
}

/** Edición de un viaje (PATCH /trips/{id}): medio de transporte y estado. */
export function EditTripSheet({ trip, visible, saving, error, onSave, onClose }: EditTripSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const [mode, setMode] = useState<TransportMode>(trip.mode);
  const [status, setStatus] = useState<TripStatus>(trip.status);
  const modes: TransportMode[] = SUSTAINABLE_MODES.includes(trip.mode as (typeof SUSTAINABLE_MODES)[number]) ? [...SUSTAINABLE_MODES] : [trip.mode, ...SUSTAINABLE_MODES];
  const changes = { ...(mode !== trip.mode ? { mode } : {}), ...(status !== trip.status ? { status } : {}) };
  const dirty = Object.keys(changes).length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Cerrar edición" />
      <View style={{ backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl }}>
        <AppText variant="subtitle">Editar viaje</AppText>
        <AppText variant="label" tone="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Medio de transporte
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
          {modes.map((m) => {
            const meta = modeMeta(m);
            return <Chip key={m} label={meta.label} icon={meta.icon} selected={mode === m} onPress={() => setMode(m)} />;
          })}
        </View>
        <AppText variant="label" tone="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Estado
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }} accessibilityRole="radiogroup">
          <Chip label="Completado" icon="checkmark-circle-outline" selected={status === 'COMPLETED'} onPress={() => setStatus('COMPLETED')} />
          <Chip label="Cancelado" icon="close-circle-outline" selected={status === 'CANCELLED'} onPress={() => setStatus('CANCELLED')} />
        </View>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
          Al guardar, el servidor recalcula la distancia, el CO₂ y los puntos. Un viaje cancelado no suma puntos.
        </AppText>
        {error ? (
          <View style={{ marginTop: spacing.md }}>
            <Banner tone="danger" message={error} />
          </View>
        ) : null}
        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          <Button label="Guardar cambios" onPress={() => onSave(changes)} loading={saving} disabled={!dirty} />
          <Button label="Cancelar" variant="ghost" onPress={onClose} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}
