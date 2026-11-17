import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { Button, EmptyState, Screen, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { errorCode, fieldErrors, getErrorMessage } from '@/lib/errors';
import { clearSession } from '@/lib/session';
import { hasErrors, validateForm, validateMatch, validatePassword } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Deep link ecomove://reset-password?token=… (contrato §2.1). Pública: funciona con o sin sesión.
 * Al confirmar, la API revoca todas las sesiones, así que se limpia la local y se va a login.
 */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { spacing, colors } = useTheme();
  const toast = useToast();
  const { status, signOut } = useAuth();
  const [v, setV] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<'password' | 'confirm', string>>>({});

  const confirm = useMutation({
    mutationFn: () => api.auth.confirmPasswordReset(token ?? '', v.password),
    onSuccess: async () => {
      toast.success('Contraseña actualizada. Inicia sesión con la nueva.');
      if (status === 'signedIn') await signOut();
      else await clearSession();
      router.replace('/login');
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      if (fe.new_password) setErrors({ password: fe.new_password });
    },
  });

  const submit = () => {
    const errs = validateForm(v, { password: validatePassword, confirm: validateMatch(v.password) });
    setErrors(errs);
    if (!hasErrors(errs)) confirm.mutate();
  };

  const header = <Stack.Screen options={{ headerShown: true, title: 'Nueva contraseña', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />;

  if (!token) {
    return (
      <Screen>
        {header}
        <EmptyState icon="link-outline" title="Enlace incompleto" message="Abre el enlace completo que recibiste por correo o solicita uno nuevo." actionLabel="Solicitar enlace" onAction={() => router.replace('/forgot-password')} />
      </Screen>
    );
  }

  const tokenInvalid = errorCode(confirm.error) === 'RESET_TOKEN_INVALID';

  return (
    <Screen keyboard>
      {header}
      {confirm.isError && !fieldErrors(confirm.error).new_password ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" message={getErrorMessage(confirm.error)} />
        </View>
      ) : null}
      <TextField
        label="Nueva contraseña"
        icon="key-outline"
        secure
        value={v.password}
        onChangeText={(t) => setV((s) => ({ ...s, password: t }))}
        error={errors.password}
        hint="Mínimo 8 caracteres, con letra y número."
        autoComplete="new-password"
      />
      <TextField
        label="Confirmar contraseña"
        icon="key-outline"
        secure
        value={v.confirm}
        onChangeText={(t) => setV((s) => ({ ...s, confirm: t }))}
        error={errors.confirm}
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {tokenInvalid ? (
        <Button label="Solicitar un enlace nuevo" variant="secondary" onPress={() => router.replace('/forgot-password')} />
      ) : (
        <Button label="Guardar contraseña" onPress={submit} loading={confirm.isPending} />
      )}
    </Screen>
  );
}
