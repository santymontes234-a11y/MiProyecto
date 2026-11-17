import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { fontFamilies } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabIcon = (active: IconName, inactive: IconName) =>
  function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size} color={typeof color === 'string' ? color : undefined} />;
  };

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: fontFamilies['600'], fontSize: 11 },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fontFamilies['700'], fontSize: 18 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Inicio', headerShown: false, tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="map" options={{ title: 'Mapa', headerShown: false, tabBarIcon: tabIcon('map', 'map-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'Historial', tabBarIcon: tabIcon('time', 'time-outline') }} />
      <Tabs.Screen name="stats" options={{ title: 'Estadísticas', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
