import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onCancel} accessibilityLabel="Cerrar diálogo">
        <Pressable
          style={[styles.dialog, { backgroundColor: colors.background, borderRadius: radius.xl, padding: spacing.xl }]}
          accessibilityViewIsModal
          onPress={() => undefined}
        >
          <AppText variant="subtitle">{title}</AppText>
          <AppText tone="muted" style={{ marginTop: spacing.sm }}>
            {message}
          </AppText>
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Button label={confirmLabel} onPress={onConfirm} variant={destructive ? 'danger' : 'primary'} loading={loading} />
            <Button label={cancelLabel} onPress={onCancel} variant="ghost" disabled={loading} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420 },
});
