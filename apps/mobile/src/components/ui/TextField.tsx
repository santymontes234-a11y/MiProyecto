import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  secure?: boolean;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, error, hint, icon, secure = false, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      <View
        style={[
          styles.inputRow,
          {
            borderColor,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceAlt,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        {icon ? <Ionicons name={icon} size={20} color={focused ? colors.primary : colors.textMuted} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[typography.body, styles.input, { color: colors.text, marginLeft: icon ? spacing.sm : 0 }]}
          {...rest}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            hitSlop={12}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" style={{ marginTop: spacing.xs }} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, minHeight: 52 },
  input: { flex: 1, paddingVertical: 12 },
});
