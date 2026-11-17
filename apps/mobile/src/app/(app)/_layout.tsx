import { Stack } from 'expo-router';

import { TripDraftProvider } from '@/features/trips/TripDraftProvider';
import { fontFamilies } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Área privada: solo accesible con sesión (guard en el layout raíz). */
export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <TripDraftProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fontFamilies['700'], fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trip/plan" options={{ title: 'Origen y destino' }} />
        <Stack.Screen name="trip/mode" options={{ title: 'Medio de transporte' }} />
        <Stack.Screen name="trip/confirm" options={{ title: 'Confirma tu viaje' }} />
        <Stack.Screen name="trip/tracking" options={{ title: 'Viaje en curso', gestureEnabled: false, headerBackVisible: false }} />
        <Stack.Screen name="trip/result" options={{ title: 'Resultado', headerBackVisible: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="trips/[id]" options={{ title: 'Detalle del viaje' }} />
        <Stack.Screen name="achievements" options={{ title: 'Logros y recompensas' }} />
        <Stack.Screen name="ranking" options={{ title: 'Ranking' }} />
        <Stack.Screen name="settings" options={{ title: 'Configuración' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notificaciones' }} />
        <Stack.Screen name="help" options={{ title: 'Ayuda y privacidad' }} />
        <Stack.Screen name="pending-trips" options={{ title: 'Viajes pendientes' }} />
        <Stack.Screen name="report" options={{ title: 'Reportar un problema' }} />
        <Stack.Screen name="my-reports" options={{ title: 'Mis reportes' }} />
        <Stack.Screen name="edit-profile" options={{ title: 'Editar perfil', presentation: 'modal' }} />
        <Stack.Screen name="change-password" options={{ title: 'Cambiar contraseña', presentation: 'modal' }} />
      </Stack>
    </TripDraftProvider>
  );
}
