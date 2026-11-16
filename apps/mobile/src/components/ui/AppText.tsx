import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'inverse' | 'accent';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
}

export function AppText({ variant = 'body', tone = 'default', align, style, ...rest }: AppTextProps) {
  const { colors, typography } = useTheme();
  const color: Record<Tone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primaryText,
    danger: colors.danger,
    inverse: colors.onPrimary,
    accent: colors.accent,
  };
  const isHeading = variant === 'display' || variant === 'title' || variant === 'subtitle';
  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color: color[tone], textAlign: align }, style]}
      {...rest}
    />
  );
}
