import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { AppText, Card, Chip, Divider, ListRow, Screen, SectionHeader, useToast } from '@/components/ui';
import { config } from '@/lib/config';
import { useThemeContext, type ThemePreference } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/ThemeProvider';

const THEMES: { value: ThemePreference; label: string; icon: 'phone-portrait-outline' | 'sunny-outline' | 'moon-outline' }[] = [
  { value: 'system', label: 'Sistema', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Claro', icon: 'sunny-outline' },
  { value: 'dark', label: 'Oscuro', icon: 'moon-outline' },
];

/** Pantalla 18 — Configuración. */
export default function SettingsScreen() {
  const { preference, setPreference } = useThemeContext();
  const { spacing } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [locationStatus, setLocationStatus] = useState<string>('Comprobando…');

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((p) =>
      setLocationStatus(p.granted ? 'Permitida mientras usas la app' : p.canAskAgain ? 'No concedida' : 'Bloqueada en Ajustes'),
    );
  }, []);

  return (
    <Screen>
      <SectionHeader title="Apariencia" />
      <Card>
        <AppText variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
          Tema
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
          {THEMES.map((t) => (
            <Chip key={t.value} label={t.label} icon={t.icon} selected={preference === t.value} onPress={() => setPreference(t.value)} />
          ))}
        </View>
      </Card>

      <SectionHeader title="Permisos" />
      <Card>
        <ListRow icon="location-outline" title="Ubicación" subtitle={locationStatus} onPress={() => void Linking.openSettings()} />
      </Card>

      <SectionHeader title="Datos" />
      <Card>
        <ListRow
          icon="refresh-outline"
          title="Actualizar datos"
          subtitle="Vuelve a descargar viajes y estadísticas"
          onPress={() => {
            void qc.invalidateQueries();
            toast.success('Datos actualizados.');
          }}
        />
        <Divider />
        <ListRow icon="map-outline" title="Mapas" subtitle={config.osmAttribution} />
      </Card>

      <SectionHeader title="Acerca de" />
      <Card>
        <ListRow icon="information-circle-outline" title="Versión" subtitle={Constants.expoConfig?.version ?? '—'} />
        <Divider />
        <ListRow icon="server-outline" title="Servidor" subtitle={config.apiBaseUrl} />
      </Card>
    </Screen>
  );
}
