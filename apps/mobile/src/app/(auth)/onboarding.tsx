import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState, type ComponentProps } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View, type ListViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, FadeIn } from '@/components/ui';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { useTheme } from '@/theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface Slide {
  key: string;
  icon: IconName;
  title: string;
  body: string;
  colorKey: 'primary' | 'accent' | 'info';
}

const SLIDES: Slide[] = [
  {
    key: 'move',
    icon: 'bicycle',
    title: 'Muévete de forma sostenible',
    body: 'Registra tus viajes en bici, caminando, en transporte público o en carpooling por la Zona Metropolitana de Querétaro.',
    colorKey: 'primary',
  },
  {
    key: 'map',
    icon: 'map',
    title: 'Descubre tu ciudad',
    body: 'Consulta ciclovías, estacionamientos de bicis y paradas en un mapa de OpenStreetMap.',
    colorKey: 'accent',
  },
  {
    key: 'impact',
    icon: 'leaf',
    title: 'Mide tu impacto',
    body: 'Mira cuánto CO₂ dejas de emitir frente al automóvil y sigue tu progreso semana a semana.',
    colorKey: 'info',
  },
];

/** Pantalla 2 — Introducción / onboarding. */
export default function OnboardingScreen() {
  const { colors, spacing, radius } = useTheme();
  const { width } = useWindowDimensions();
  const { complete } = useOnboarding();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  // FlatList exige que onViewableItemsChanged no cambie entre renders.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  });

  const finish = (to: '/login' | '/register') => {
    complete();
    router.replace(to);
  };

  const last = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Pressable onPress={() => finish('/login')} accessibilityRole="button" hitSlop={12}>
          <AppText variant="label" tone="muted">
            Omitir
          </AppText>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: spacing.xxl, alignItems: 'center', justifyContent: 'center' }}>
            <FadeIn>
              <View style={[styles.hero, { backgroundColor: colors.primarySoft, borderRadius: radius.pill }]}>
                <Ionicons name={item.icon} size={96} color={colors[item.colorKey]} />
              </View>
            </FadeIn>
            <AppText variant="title" align="center" style={{ marginTop: spacing.xxl }}>
              {item.title}
            </AppText>
            <AppText tone="muted" align="center" style={{ marginTop: spacing.md, maxWidth: 420 }}>
              {item.body}
            </AppText>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.xl }} accessibilityLabel={`Paso ${index + 1} de ${SLIDES.length}`}>
        {SLIDES.map((s, i) => (
          <View
            key={s.key}
            style={{
              width: i === index ? 24 : 8,
              height: 8,
              borderRadius: 4,
              marginHorizontal: 4,
              backgroundColor: i === index ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {last ? (
          <>
            <Button label="Crear cuenta" onPress={() => finish('/register')} />
            <Button label="Ya tengo cuenta" variant="ghost" onPress={() => finish('/login')} />
          </>
        ) : (
          <Button label="Siguiente" icon="arrow-forward" onPress={() => listRef.current?.scrollToIndex({ index: index + 1, animated: true })} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
});
