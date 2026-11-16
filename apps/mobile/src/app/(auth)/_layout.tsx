import { Stack } from 'expo-router';

import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const { done } = useOnboarding();
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      {/* La introducción solo existe hasta completarla; después la primera pantalla es login. */}
      <Stack.Protected guard={!done}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
