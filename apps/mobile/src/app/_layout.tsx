// Imports por peso: el índice del paquete empaqueta las 18 variantes (~6 MB).
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui';
import { AnimatedSplash } from '@/features/auth/AnimatedSplash';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <OnboardingProvider>
            <AuthProvider>
              <ToastProvider>{fontsReady ? <RootNavigator /> : null}</ToastProvider>
            </AuthProvider>
          </OnboardingProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  const onboarding = useOnboarding();
  const theme = useTheme();
  const booting = status === 'loading' || status === 'offline' || !onboarding.loaded;
  // El splash animado (pantalla 1) se muestra al menos 1.2 s para que la transición no parpadee.
  const [minSplashDone, setMinSplashDone] = useState(false);

  useEffect(() => {
    void SplashScreen.hideAsync();
    const t = setTimeout(() => setMinSplashDone(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (booting || !minSplashDone) return <AnimatedSplash />;

  const signedIn = status === 'signedIn';
  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
