import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { AuthHeader } from '@/features/auth/AuthHeader';
import { validateEmail } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Pantalla 5 — Recuperación de contraseña.
 * El contrato v1.0 aún no define endpoints de recuperación
 * (propuesta docs/proposals/2026-11-15-mobile-password-reset-notifications.md).
 * No se simula el envío: se valida el correo y se explica cómo recuperar el acceso hoy.
 */
export default function ForgotPasswordScreen() {
  const { spacing } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const submit = () => {
    const err = validateEmail(email);
    setError(err);
    if (!err) setChecked(true);
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader back title="Recupera tu acceso" subtitle="Te ayudamos a volver a tu cuenta." />
      <View style={{ marginBottom: spacing.lg }}>
        <Banner
          tone="info"
          message="El restablecimiento automático de contraseña por correo está en preparación y estará disponible en una próxima versión."
        />
      </View>
      <TextField
        label="Correo de tu cuenta"
        icon="mail-outline"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setError(null);
          setChecked(false);
        }}
        error={error}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Button label="Continuar" onPress={submit} />
      {checked ? (
        <Card tone="soft" style={{ marginTop: spacing.xl }}>
          <AppText variant="bodyStrong">Mientras tanto</AppText>
          <AppText tone="muted" style={{ marginTop: spacing.xs }}>
            Escribe a soporte de EcoMove Querétaro desde {email.trim()} para verificar tu identidad y restablecer el acceso.
            Si recuerdas tu contraseña, puedes cambiarla en Perfil › Seguridad.
          </AppText>
        </Card>
      ) : null}
      <Button label="Volver a iniciar sesión" variant="ghost" onPress={() => router.replace('/login')} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
