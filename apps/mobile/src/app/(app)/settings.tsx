import { VEHICLE_TYPE_LABELS, type VehicleType } from '@ecomove/shared';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { AppText, Card, Chip, Divider, ListRow, Screen, SectionHeader, Skeleton, useToast } from '@/components/ui';
import { usePreferences, useUpdatePreferences, useVehicleTypes } from '@/features/trips/vehicle';
import { getErrorMessage } from '@/lib/errors';
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
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const { types: vehicleTypes } = useVehicleTypes();

  const setDefaultVehicle = (v: VehicleType | null) => {
    if (!prefs.data || updatePrefs.isPending) return;
    updatePrefs.mutate(
      { ...prefs.data, default_vehicle_type: v },
      {
        onSuccess: () => toast.success(v ? `Vehículo por defecto: ${VEHICLE_TYPE_LABELS[v]}.` : 'Sin vehículo por defecto.'),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };

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

      <SectionHeader title="Mi vehículo" />
      <Card>
        <AppText variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
          Vehículo por defecto
        </AppText>
        <AppText variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
          Se usa para comparar el CO₂ de tus viajes y en carpooling.
        </AppText>
        {prefs.isPending ? (
          <Skeleton height={36} />
        ) : prefs.isError ? (
          <AppText variant="caption" tone="danger">
            {getErrorMessage(prefs.error)}
          </AppText>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
            <Chip label="Sin definir" selected={!prefs.data.default_vehicle_type} onPress={() => setDefaultVehicle(null)} />
            {vehicleTypes.map((t) => (
              <Chip
                key={t.code}
                label={VEHICLE_TYPE_LABELS[t.code]}
                icon="car-outline"
                selected={prefs.data.default_vehicle_type === t.code}
                onPress={() => setDefaultVehicle(t.code)}
              />
            ))}
          </View>
        )}
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
        <ListRow icon="map-outline" title="Mapas" subtitle={config.tileAttribution} />
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
