import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  size = 'lg',
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const inactive = disabled || loading;

  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.primaryStrong, border: colors.primarySoft },
    outline: { bg: 'transparent', fg: colors.primaryText, border: colors.primary },
    ghost: { bg: 'transparent', fg: colors.primaryText, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.onPrimary, border: colors.danger },
  };
  const p = palette[variant];

  const animateTo = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.full, style]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        style={[
          styles.base,
          {
            backgroundColor: p.bg,
            borderColor: p.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.xl,
            minHeight: size === 'lg' ? 52 : 44,
            opacity: inactive ? 0.55 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <Ionicons name={icon} size={20} color={p.fg} style={{ marginRight: spacing.sm }} /> : null}
            <AppText variant="button" style={{ color: p.fg }}>
              {label}
            </AppText>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
