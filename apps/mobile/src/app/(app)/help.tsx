import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';

import { AppText, Card, Divider, ListRow, Screen, SectionHeader } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const FAQ = [
  {
    q: '¿Cómo registro un viaje?',
    a: 'En Inicio toca «Registrar un viaje», elige origen y destino en el mapa y el medio de transporte. Al iniciar, la app graba tu ruta con GPS; al llegar, toca «Terminar».',
  },
  {
    q: '¿Cómo se calcula el CO₂ evitado?',
    a: 'El servidor multiplica la distancia real de tu ruta por los factores de emisión oficiales de cada modo y la compara con hacer el mismo trayecto en automóvil.',
  },
  {
    q: '¿Por qué la distancia final es distinta a la estimada?',
    a: 'La estimación previa usa la línea recta entre origen y destino. La distancia final se calcula con la ruta GPS que recorriste.',
  },
  {
    q: '¿Funciona con la pantalla apagada?',
    a: 'Por ahora el registro funciona con la app abierta en primer plano. Mantén la pantalla activa durante el trayecto.',
  },
  {
    q: '¿Qué pasa si pierdo la conexión?',
    a: 'Tu recorrido se queda en el teléfono y puedes reintentar el guardado cuando vuelvas a tener señal, sin duplicar el viaje.',
  },
];

/** Pantalla 20 — Ayuda y privacidad. */
export default function HelpScreen() {
  const { spacing, colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Screen>
      <SectionHeader title="Preguntas frecuentes" />
      <Card padded={false}>
        {FAQ.map((f, i) => {
          const expanded = open === i;
          return (
            <View key={f.q}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setOpen(expanded ? null : i);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, minHeight: 56 }}
              >
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {f.q}
                </AppText>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
              </Pressable>
              {expanded ? (
                <AppText tone="muted" style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
                  {f.a}
                </AppText>
              ) : null}
            </View>
          );
        })}
      </Card>

      <SectionHeader title="Privacidad" />
      <Card>
        <ListRow icon="shield-checkmark-outline" title="Aviso de privacidad" subtitle="Cómo usamos tus datos (LFPDPPP)" onPress={() => router.push('/privacy')} />
      </Card>
    </Screen>
  );
}
