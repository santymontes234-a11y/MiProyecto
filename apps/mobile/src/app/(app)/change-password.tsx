import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { Button, Screen, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { fieldErrors, getErrorMessage } from '@/lib/errors';
import { hasErrors, validateForm, validateMatch, validatePassword, validateRequired } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

type Field = 'current_password' | 'new_password' | 'confirm';

/**
 * Cambio de contraseña — POST /users/me/password.
 * La API revoca todos los refresh tokens, así que tras el cambio se cierra la sesión local.
 */
export default function ChangePasswordScreen() {
  const { signOut } = useAuth();
  const toast = useToast();
  const { spacing } = useTheme();
  const [v, setV] = useState<Record<Field, string>>({ current_password: '', new_password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.users.changePassword({ current_password: v.current_password, new_password: v.new_password }),
    onSuccess: async () => {
      toast.success('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
      await signOut();
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      if (Object.keys(fe).length) setErrors(fe);
      else setFormError(getErrorMessage(e));
    },
  });

  const set = (k: Field) => (val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setFormError(null);
  };

  const submit = () => {
    const errs = validateForm(v, {
      current_password: validateRequired('Ingresa tu contraseña actual.'),
      new_password: validatePassword,
      confirm: validateMatch(v.new_password),
    });
    if (!errs.new_password && v.new_password && v.new_password === v.current_password) errs.new_password = 'La nueva contraseña debe ser distinta a la actual.';
    setErrors(errs);
    if (!hasErrors(errs)) change.mutate();
  };

  return (
    <Screen keyboard>
      {formError ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" message={formError} />
        </View>
      ) : null}
      <TextField label="Contraseña actual" icon="lock-closed-outline" secure value={v.current_password} onChangeText={set('current_password')} error={errors.current_password} autoComplete="current-password" />
      <TextField label="Nueva contraseña" icon="key-outline" secure value={v.new_password} onChangeText={set('new_password')} error={errors.new_password} hint="Mínimo 8 caracteres, con letra y número." autoComplete="new-password" />
      <TextField label="Confirmar nueva contraseña" icon="key-outline" secure value={v.confirm} onChangeText={set('confirm')} error={errors.confirm} autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} />
      <View style={{ marginBottom: spacing.xl }}>
        <Banner tone="warning" message="Por seguridad cerraremos tu sesión en todos tus dispositivos." />
      </View>
      <Button label="Cambiar contraseña" onPress={submit} loading={change.isPending} />
    </Screen>
  );
}
