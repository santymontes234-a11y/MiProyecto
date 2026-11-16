import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    counter.current += 1;
    setToast({ id: counter.current, type, message });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} item={toast} onHide={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ item, onHide }: { item: ToastItem; onHide: () => void }) {
  const { colors, radius, spacing, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onHide);
    }, 3200);
    return () => clearTimeout(t);
  }, [anim, onHide]);

  // Combinaciones con contraste AA en ambos temas.
  const meta = {
    success: { icon: 'checkmark-circle' as const, bg: dark ? colors.primarySoft : colors.primaryStrong, fg: dark ? colors.text : colors.onPrimary },
    error: { icon: 'alert-circle' as const, bg: colors.danger, fg: dark ? colors.onWarning : colors.onPrimary },
    info: { icon: 'information-circle' as const, bg: colors.info, fg: colors.onPrimary },
  }[item.type];
  const fg = meta.fg;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + 84,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={onHide}
        accessibilityRole="alert"
        accessibilityLabel={item.message}
        style={[styles.toast, { backgroundColor: meta.bg, borderRadius: radius.md, padding: spacing.md }]}
      >
        <Ionicons name={meta.icon} size={22} color={fg} />
        <AppText style={{ color: fg, marginLeft: spacing.sm, flex: 1 }}>{item.message}</AppText>
      </Pressable>
    </Animated.View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 560,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
});
