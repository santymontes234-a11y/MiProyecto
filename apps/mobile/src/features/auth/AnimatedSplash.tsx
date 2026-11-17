import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND } from '@ecomove/shared';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from './AuthProvider';

/** Pantalla 1 — Splash: continúa el splash nativo mientras se restaura la sesión. */
export function AnimatedSplash() {
  const { colors, spacing } = useTheme();
  const { status, retryBootstrap } = useAuth();
  const [scale] = useState(() => new Animated.Value(0.6));
  const [opacity] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
        Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]).start();
      loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
      loop.start();
    });
    return () => loop?.stop();
  }, [opacity, scale, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-12deg', '0deg'] });
  const offline = status === 'offline';

  return (
    <View style={[styles.root, { backgroundColor: colors.primary }]} accessibilityLabel="EcoMove Querétaro cargando">
      <Animated.View style={{ alignItems: 'center', opacity, transform: [{ scale }] }}>
        <Animated.View style={[styles.logo, { backgroundColor: colors.onPrimary, transform: [{ rotate }] }]}>
          <Ionicons name="leaf" size={56} color={colors.primary} />
        </Animated.View>
        <AppText variant="display" style={{ color: colors.onPrimary, marginTop: spacing.xl }}>
          EcoMove
        </AppText>
        <AppText variant="subtitle" style={{ color: colors.onPrimary, opacity: 0.9 }}>
          Querétaro
        </AppText>
      </Animated.View>
      {offline ? (
        <View style={{ position: 'absolute', bottom: 64, left: spacing.xl, right: spacing.xl, alignItems: 'center' }}>
          <AppText align="center" style={{ color: colors.onPrimary, marginBottom: spacing.lg }}>
            No pudimos conectar con el servidor. Tu sesión sigue guardada en este dispositivo.
          </AppText>
          <Button label="Reintentar" icon="refresh" variant="secondary" onPress={() => void retryBootstrap()} />
        </View>
      ) : (
        <AppText variant="caption" style={{ position: 'absolute', bottom: 48, color: colors.onPrimary, opacity: 0.85 }}>
          {BRAND.slogan}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 112, height: 112, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
