import type { PropsWithChildren } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface CardProps {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'default' | 'primary' | 'soft';
  padded?: boolean;
}

export function Card({ children, style, onPress, accessibilityLabel, tone = 'default', padded = true }: PropsWithChildren<CardProps>) {
  const { colors, radius, spacing, elevation, dark } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'soft' ? colors.primarySoft : dark ? colors.surface : colors.background;
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius.lg,
    padding: padded ? spacing.lg : 0,
    borderWidth: dark || tone !== 'default' ? 0 : 1,
    borderColor: colors.border,
    ...(dark ? {} : elevation.card),
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
