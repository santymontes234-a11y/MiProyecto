import { formatCo2, ROLE_LABELS } from '@ecomove/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Avatar, Card, ConfirmDialog, Divider, ListRow, Screen, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useStatsMe } from '@/features/stats/useStats';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

/** Pantalla 15 — Perfil. */
export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { spacing, colors } = useTheme();
  const all = useStatsMe('all');
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (!user) return null;

  const logout = async () => {
    setLeaving(true);
    await signOut();
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Avatar name={user.full_name} size={88} />
        <AppText variant="title" style={{ marginTop: spacing.md }}>
          {user.full_name}
        </AppText>
        <AppText tone="muted">{user.email}</AppText>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          {ROLE_LABELS[user.role]} · Miembro desde {formatDate(user.created_at)}
        </AppText>
      </View>

      <Card tone="soft" style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`CO2 evitado total: ${all.data ? formatCo2(all.data.co2_saved_g) : 'cargando'}`}>
          {all.data ? <AppText variant="title" style={{ color: colors.primaryStrong }}>{formatCo2(all.data.co2_saved_g)}</AppText> : <Skeleton width={80} height={28} />}
          <AppText variant="caption" style={{ color: colors.primaryStrong }}>
            CO₂ evitado
          </AppText>
        </View>
        <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`Viajes: ${all.data?.trips_count ?? 'cargando'}`}>
          {all.data ? <AppText variant="title" style={{ color: colors.primaryStrong }}>{all.data.trips_count}</AppText> : <Skeleton width={40} height={28} />}
          <AppText variant="caption" style={{ color: colors.primaryStrong }}>
            Viajes
          </AppText>
        </View>
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <ListRow icon="person-outline" title="Editar perfil" subtitle="Nombre" onPress={() => router.push('/edit-profile')} />
        <Divider />
        <ListRow icon="key-outline" title="Seguridad" subtitle="Cambiar contraseña" onPress={() => router.push('/change-password')} />
        <Divider />
        <ListRow icon="trophy-outline" title="Logros y recompensas" onPress={() => router.push('/achievements')} />
        <Divider />
        <ListRow icon="podium-outline" title="Ranking" onPress={() => router.push('/ranking')} />
        <Divider />
        <ListRow icon="cloud-upload-outline" title="Viajes pendientes" subtitle="Guardados en el teléfono sin enviar" onPress={() => router.push('/pending-trips')} />
        <Divider />
        <ListRow icon="megaphone-outline" title="Mis reportes" subtitle="Problemas de infraestructura reportados" onPress={() => router.push('/my-reports')} />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <ListRow icon="notifications-outline" title="Notificaciones" onPress={() => router.push('/notifications')} />
        <Divider />
        <ListRow icon="settings-outline" title="Configuración" subtitle="Tema y preferencias" onPress={() => router.push('/settings')} />
        <Divider />
        <ListRow icon="help-circle-outline" title="Ayuda y privacidad" onPress={() => router.push('/help')} />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <ListRow icon="log-out-outline" title="Cerrar sesión" destructive onPress={() => setConfirm(true)} />
      </Card>

      <ConfirmDialog
        visible={confirm}
        title="¿Cerrar sesión?"
        message="Tendrás que volver a ingresar tu correo y contraseña para registrar viajes."
        confirmLabel="Cerrar sesión"
        destructive
        loading={leaving}
        onConfirm={() => void logout()}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}
