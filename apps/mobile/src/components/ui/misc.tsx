import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type PropsWithChildren, type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Aparición suave con desplazamiento; respeta "reducir movimiento". */
export function FadeIn({ children, delay = 0, style }: PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) anim.setValue(1);
      else Animated.timing(anim, { toValue: 1, duration: 380, delay, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [anim, delay]);
  return (
    <Animated.View
      style={[{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }, style]}
    >
      {children}
    </Animated.View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : 'transparent',
        minHeight: 36,
      }}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? colors.primary : colors.textMuted} style={{ marginRight: 6 }} /> : null}
      <AppText variant="label" style={{ color: selected ? colors.primaryText : colors.textMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function IconBubble({ icon, color, bg, size = 44 }: { icon: IconName; color?: string; bg?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg ?? colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.5} color={color ?? colors.primary} />
    </View>
  );
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  destructive = false,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const content = (
    <>
      {icon ? (
        <IconBubble
          icon={icon}
          size={38}
          color={destructive ? colors.danger : iconColor}
          bg={destructive ? colors.dangerSoft : undefined}
        />
      ) : null}
      <View style={{ flex: 1, marginLeft: icon ? spacing.md : 0 }}>
        <AppText variant="bodyStrong" tone={destructive ? 'danger' : 'default'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null)}
    </>
  );
  const style = [styles.row, { paddingVertical: spacing.md }];
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [...style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style} accessible accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}>
      {content}
    </View>
  );
}

export function StatTile({
  icon,
  label,
  value,
  color,
  style,
}: {
  icon: IconName;
  label: string;
  value: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing, dark } = useTheme();
  const c = color ?? colors.primary;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[
        {
          flex: 1,
          minWidth: 140,
          padding: spacing.lg,
          borderRadius: radius.lg,
          backgroundColor: dark ? colors.surface : colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={22} color={c} />
      <AppText variant="title" style={{ marginTop: spacing.sm }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
      <AppText variant="subtitle" style={{ flex: 1 }}>
        {title}
      </AppText>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
          <AppText variant="overline" tone="primary">
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      accessibilityLabel={`Avatar de ${name}`}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppText variant="title" style={{ color: colors.onPrimary, fontSize: size * 0.38, lineHeight: size * 0.5 }}>{initials || '?'}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
