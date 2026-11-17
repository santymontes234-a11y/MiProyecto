import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, BrandLogo, FadeIn } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export function AuthHeader({ title, subtitle, back = false }: { title: string; subtitle: string; back?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={12}
          style={{ marginBottom: spacing.lg, width: 44, height: 44, justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      ) : null}
      <FadeIn>
        <View style={{ marginBottom: spacing.lg }}>
          <BrandLogo size={56} />
        </View>
        <AppText variant="title">{title}</AppText>
        <AppText tone="muted" style={{ marginTop: spacing.xs }}>
          {subtitle}
        </AppText>
      </FadeIn>
    </View>
  );
}
