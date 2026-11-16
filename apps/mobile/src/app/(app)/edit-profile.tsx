import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/trips/TripComponents';
import { Button, Screen, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { fieldErrors, getErrorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/query-client';
import { validateFullName } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

/** Edición de perfil — PATCH /users/me. */
export default function EditProfileScreen() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const [name, setName] = useState(user?.full_name ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (full_name: string) => api.users.updateMe({ full_name }),
    onSuccess: (u) => {
      setUser(u);
      qc.setQueryData(queryKeys.me, u);
      toast.success('Perfil actualizado.');
      router.back();
    },
    onError: (e) => setError(fieldErrors(e).full_name ?? getErrorMessage(e)),
  });

  const submit = () => {
    const err = validateFullName(name);
    setError(err);
    if (!err) save.mutate(name.trim());
  };

  return (
    <Screen keyboard>
      <TextField label="Nombre completo" icon="person-outline" value={name} onChangeText={(v) => { setName(v); setError(null); }} error={error} autoComplete="name" returnKeyType="done" onSubmitEditing={submit} />
      <View style={{ marginBottom: spacing.xl }}>
        <Banner tone="info" message={`Tu correo (${user?.email ?? ''}) no se puede cambiar desde la app.`} />
      </View>
      <Button label="Guardar cambios" onPress={submit} loading={save.isPending} disabled={name.trim() === user?.full_name} />
    </Screen>
  );
}
