import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const { colors, radius: r } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius ?? r.sm, backgroundColor: colors.skeleton, opacity }, style]}
    />
  );
}

/** Bloque de carga para listas: n filas con avatar y dos líneas. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel="Cargando" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
          <Skeleton width={44} height={44} radius={22} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="40%" height={12} style={{ marginTop: spacing.sm }} />
          </View>
        </View>
      ))}
    </View>
  );
}
