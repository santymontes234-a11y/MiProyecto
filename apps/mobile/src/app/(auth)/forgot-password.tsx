import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { AuthHeader } from '@/features/auth/AuthHeader';
import { api } from '@/lib/api';
import { fieldErrors, getErrorMessage } from '@/lib/errors';
import { validateEmail } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Pantalla 5 — Recuperación de contraseña (POST /auth/password-reset/request).
 * La API responde 202 siempre (no revela si el correo existe). El correo trae el enlace
 * ecomove://reset-password?token=…, que abre la pantalla /reset-password.
 */
export default function ForgotPasswordScreen() {
  const { spacing } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (value: string) => api.auth.requestPasswordReset(value.trim().toLowerCase()),
    onError: (e) => setError(fieldErrors(e).email ?? getErrorMessage(e)),
  });

  const submit = () => {
    const err = validateEmail(email);
    setError(err);
    if (!err) send.mutate(email);
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader back title="Recupera tu acceso" subtitle="Te enviaremos un enlace para crear una nueva contraseña." />
      {send.isSuccess ? (
        <Card tone="soft">
          <AppText variant="bodyStrong">Revisa tu correo</AppText>
          <AppText tone="muted" style={{ marginTop: spacing.xs }}>
            {send.data.message || `Si ${email.trim()} tiene una cuenta, recibirás un enlace válido durante 30 minutos.`} Ábrelo desde este teléfono para
            restablecer tu contraseña.
          </AppText>
          <Button label="Enviar de nuevo" variant="ghost" onPress={() => send.reset()} style={{ marginTop: spacing.md }} />
        </Card>
      ) : (
        <>
          <TextField
            label="Correo de tu cuenta"
            icon="mail-outline"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            error={error}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button label="Enviar enlace" icon="mail" onPress={submit} loading={send.isPending} />
          <View style={{ marginTop: spacing.lg }}>
            <Banner tone="info" message="Por seguridad, siempre mostramos el mismo mensaje, exista o no la cuenta." />
          </View>
        </>
      )}
      <Button label="Volver a iniciar sesión" variant="ghost" onPress={() => router.replace('/login')} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
