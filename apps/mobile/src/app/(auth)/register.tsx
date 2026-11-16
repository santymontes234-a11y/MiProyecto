import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInputInstance } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { AppText, Button, Screen, TextField, useToast } from '@/components/ui';
import { AuthHeader } from '@/features/auth/AuthHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorCode, fieldErrors, getErrorMessage } from '@/lib/errors';
import { hasErrors, validateEmail, validateForm, validateFullName, validateMatch, validatePassword } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

type Field = 'full_name' | 'email' | 'password' | 'confirm';

/** Pantalla 3 — Registro. */
export default function RegisterScreen() {
  const { signUp } = useAuth();
  const toast = useToast();
  const { colors, spacing } = useTheme();
  const [values, setValues] = useState<Record<Field, string>>({ full_name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const set = (k: Field) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    const errs = validateForm(values, {
      full_name: validateFullName,
      email: validateEmail,
      password: validatePassword,
      confirm: validateMatch(values.password),
    });
    setErrors(errs);
    setFormError(null);
    if (hasErrors(errs)) return;
    if (!accepted) {
      setFormError('Debes aceptar el aviso de privacidad para crear tu cuenta.');
      return;
    }
    setLoading(true);
    try {
      const res = await signUp({ full_name: values.full_name, email: values.email, password: values.password });
      if (res.result === 'signedIn') {
        toast.success('¡Cuenta creada! Bienvenido a EcoMove.');
      } else {
        toast.success('Cuenta creada. Revisa tu correo para confirmarla.');
        router.replace({ pathname: '/login', params: { verify: '1' } });
      }
    } catch (e) {
      const fe = fieldErrors(e);
      if (errorCode(e) === 'EMAIL_ALREADY_REGISTERED') setErrors({ email: getErrorMessage(e) });
      else if (Object.keys(fe).length) setErrors(fe);
      else setFormError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <AuthHeader back title="Crea tu cuenta" subtitle="Empieza a medir tu impacto en minutos." />
      {formError ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" message={formError} />
        </View>
      ) : null}
      <TextField
        label="Nombre completo"
        icon="person-outline"
        value={values.full_name}
        onChangeText={set('full_name')}
        error={errors.full_name}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        placeholder="Ana López"
      />
      <TextField
        ref={emailRef}
        label="Correo electrónico"
        icon="mail-outline"
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passRef.current?.focus()}
        placeholder="ana@correo.com"
      />
      <TextField
        ref={passRef}
        label="Contraseña"
        icon="lock-closed-outline"
        secure
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        hint="Mínimo 8 caracteres, con al menos una letra y un número."
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef}
        label="Confirmar contraseña"
        icon="lock-closed-outline"
        secure
        value={values.confirm}
        onChangeText={set('confirm')}
        error={errors.confirm}
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Pressable
        onPress={() => setAccepted((a) => !a)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel="Acepto el aviso de privacidad"
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, minHeight: 44 }}
      >
        <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={24} color={accepted ? colors.primary : colors.textMuted} />
        <AppText variant="caption" style={{ marginLeft: spacing.sm, flex: 1 }}>
          Acepto el{' '}
          <AppText variant="caption" tone="primary" onPress={() => router.push('/privacy')} suppressHighlighting>
            aviso de privacidad
          </AppText>{' '}
          y el tratamiento de mis trayectos conforme a la LFPDPPP.
        </AppText>
      </Pressable>
      <Button label="Crear cuenta" onPress={() => void submit()} loading={loading} testID="register-submit" />
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <AppText tone="muted">¿Ya tienes cuenta? </AppText>
        <Link href="/login" asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <AppText variant="bodyStrong" tone="primary">
              Inicia sesión
            </AppText>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}
