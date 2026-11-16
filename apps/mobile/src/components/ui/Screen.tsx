import type { PropsWithChildren, ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

export interface ScreenProps {
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  keyboard?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactElement | null;
}

/** Contenedor base: safe area, fondo del tema, scroll opcional y ancho máximo para tablets. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['bottom'],
  keyboard = false,
  refreshing,
  onRefresh,
  contentStyle,
  footer,
}: PropsWithChildren<ScreenProps>) {
  const { colors, spacing } = useTheme();
  const inner: ViewStyle = { padding: padded ? spacing.lg : 0, width: '100%', maxWidth: 720, alignSelf: 'center' };

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[inner, styles.grow, contentStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[inner, styles.grow, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }]}>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
          {footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {footer ? <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>{footer}</View> : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
