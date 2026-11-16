import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface StateViewProps {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'danger' | 'info';
}

function StateView({ icon, title, message, actionLabel, onAction, tone = 'neutral' }: StateViewProps) {
  const { colors, spacing, radius } = useTheme();
  const bubble = tone === 'danger' ? colors.dangerSoft : colors.primarySoft;
  const fg = tone === 'danger' ? colors.danger : tone === 'info' ? colors.info : colors.primary;
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg }} accessibilityRole="summary">
      <View style={{ width: 88, height: 88, borderRadius: radius.pill, backgroundColor: bubble, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={40} color={fg} />
      </View>
      <AppText variant="subtitle" align="center" style={{ marginTop: spacing.lg }}>
        {title}
      </AppText>
      {message ? (
        <AppText tone="muted" align="center" style={{ marginTop: spacing.sm, maxWidth: 360 }}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" fullWidth={false} style={{ marginTop: spacing.xl }} />
      ) : null}
    </View>
  );
}

export const EmptyState = (p: Omit<StateViewProps, 'tone'>) => <StateView {...p} />;

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <StateView
      icon="cloud-offline-outline"
      tone="danger"
      title="Algo salió mal"
      message={message}
      actionLabel={onRetry ? 'Reintentar' : undefined}
      onAction={onRetry}
    />
  );
}

/** Para funcionalidades que dependen de endpoints aún no aprobados en API_CONTRACT.md. */
export function ComingSoonState({ title, message }: { title: string; message: string }) {
  return <StateView icon="construct-outline" tone="info" title={title} message={message} />;
}
