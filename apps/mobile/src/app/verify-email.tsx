import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';

/** Deep link ecomove://verify-email?token=… (contrato §2.1). */
export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { colors, spacing } = useTheme();
  const { status } = useAuth();
  const verify = useMutation({ mutationFn: (t: string) => api.auth.confirmEmailVerification(t) });
  const { mutate } = verify;

  useEffect(() => {
    if (token) mutate(token);
  }, [token, mutate]);

  const goOn = () => router.replace(status === 'signedIn' ? '/home' : '/login');

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Verificar correo', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
      {!token ? (
        <EmptyState icon="link-outline" title="Enlace incompleto" message="Abre el enlace completo que recibiste por correo." />
      ) : verify.isPending ? (
        <View style={{ alignItems: 'center', marginTop: spacing.xxl }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <AppText tone="muted" style={{ marginTop: spacing.md }}>
            Verificando tu correo…
          </AppText>
        </View>
      ) : verify.isSuccess ? (
        <EmptyState icon="checkmark-circle-outline" title="¡Correo verificado!" message="Tu cuenta está lista." actionLabel="Continuar" onAction={goOn} />
      ) : verify.isError ? (
        <>
          <EmptyState icon="alert-circle-outline" title="No pudimos verificar tu correo" message={getErrorMessage(verify.error)} />
          <Button label="Continuar" variant="ghost" onPress={goOn} />
        </>
      ) : null}
    </Screen>
  );
}
