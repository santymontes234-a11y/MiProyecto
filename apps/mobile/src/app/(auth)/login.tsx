import { Link, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInputInstance } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { AppText, Button, Screen, TextField, useToast } from '@/components/ui';
import { AuthHeader } from '@/features/auth/AuthHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { fieldErrors, getErrorMessage } from '@/lib/errors';
import { hasErrors, validateForm, validateRequired, validateEmail } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

type Field = 'email' | 'password';

/** Pantalla 4 — Inicio de sesión. Autentica contra la API; nunca guarda la contraseña. */
export default function LoginScreen() {
  const { signIn, sessionExpired } = useAuth();
  const { verify } = useLocalSearchParams<{ verify?: string }>();
  const toast = useToast();
  const { spacing } = useTheme();
  const [values, setValues] = useState<Record<Field, string>>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const set = (k: Field) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    const errs = validateForm(values, { email: validateEmail, password: validateRequired('Ingresa tu contraseña.') });
    setErrors(errs);
    setFormError(null);
    if (hasErrors(errs)) return;
    setLoading(true);
    try {
      await signIn(values);
      toast.success('¡Bienvenido de nuevo!');
    } catch (e) {
      const fe = fieldErrors(e);
      if (Object.keys(fe).length) setErrors(fe);
      else setFormError(getErrorMessage(e));
      setValues((s) => ({ ...s, password: '' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing.xl }}>
        <AuthHeader title="Inicia sesión" subtitle="Sigue sumando kilómetros sostenibles." />
        {verify === '1' ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Banner tone="success" message="Te enviamos un correo de confirmación. Abre el enlace y después inicia sesión." />
          </View>
        ) : null}
        {sessionExpired ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Banner tone="warning" message="Tu sesión expiró. Inicia sesión de nuevo para continuar." />
          </View>
        ) : null}
        {formError ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Banner tone="danger" message={formError} />
          </View>
        ) : null}
        <TextField
          label="Correo electrónico"
          icon="mail-outline"
          value={values.email}
          onChangeText={set('email')}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="ana@correo.com"
        />
        <TextField
          ref={passwordRef}
          label="Contraseña"
          icon="lock-closed-outline"
          secure
          value={values.password}
          onChangeText={set('password')}
          error={errors.password}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Link href="/forgot-password" asChild>
          <Pressable accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-end', marginBottom: spacing.xl }}>
            <AppText variant="label" tone="primary">
              ¿Olvidaste tu contraseña?
            </AppText>
          </Pressable>
        </Link>
        <Button label="Iniciar sesión" onPress={() => void submit()} loading={loading} testID="login-submit" />
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
          <AppText tone="muted">¿No tienes cuenta? </AppText>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="bodyStrong" tone="primary">
                Regístrate
              </AppText>
            </Pressable>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
