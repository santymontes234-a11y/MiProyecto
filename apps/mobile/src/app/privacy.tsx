import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const SECTIONS = [
  {
    icon: 'person-outline' as const,
    title: 'Datos que recabamos',
    body: 'Nombre, correo electrónico y los trayectos que decides registrar: ruta GPS, horario, medio de transporte y distancia.',
  },
  {
    icon: 'analytics-outline' as const,
    title: 'Para qué los usamos',
    body: 'Para calcular tu CO₂ evitado, mostrarte tus estadísticas y generar indicadores agregados y anónimos de movilidad para Querétaro.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Cómo los protegemos',
    body: 'Tus trazas GPS son datos sensibles: solo tú puedes verlas. El personal administrativo solo consulta cifras agregadas. Tu sesión se guarda cifrada en el dispositivo y nunca almacenamos tu contraseña en el teléfono.',
  },
  {
    icon: 'location-outline' as const,
    title: 'Ubicación',
    body: 'Solo usamos tu ubicación mientras la app está abierta y registrando un viaje, o cuando tocas «Usar mi ubicación». No rastreamos en segundo plano.',
  },
  {
    icon: 'hand-left-outline' as const,
    title: 'Tus derechos ARCO',
    body: 'Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos. Puedes eliminar cualquier viaje desde su detalle. Para otras solicitudes, contacta a soporte de EcoMove Querétaro.',
  },
];

/** Aviso de privacidad (pública: accesible también desde el registro). */
export default function PrivacyScreen() {
  const { colors, spacing } = useTheme();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Aviso de privacidad', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
      <Screen>
        <AppText tone="muted" style={{ marginBottom: spacing.lg }}>
          Resumen conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
        </AppText>
        {SECTIONS.map((s) => (
          <Card key={s.title} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <Ionicons name={s.icon} size={20} color={colors.primary} />
              <AppText variant="bodyStrong" style={{ marginLeft: spacing.sm }}>
                {s.title}
              </AppText>
            </View>
            <AppText tone="muted">{s.body}</AppText>
          </Card>
        ))}
      </Screen>
    </>
  );
}
