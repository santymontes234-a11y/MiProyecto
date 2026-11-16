import * as SecureStore from 'expo-secure-store';

/**
 * Envoltorio mínimo sobre expo-secure-store.
 * - Nunca se guardan contraseñas.
 * - El refresh token es el único secreto persistido (ADR-003).
 * - Las preferencias no sensibles se guardan aquí también para no añadir
 *   otra dependencia de almacenamiento; son valores pequeños.
 */
export const StorageKeys = {
  refreshToken: 'ecomove.auth.refresh_token',
  onboardingDone: 'ecomove.onboarding_done',
  themePreference: 'ecomove.theme_preference',
  notificationPrefs: 'ecomove.notification_prefs',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

export async function getItem(key: StorageKey): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // Valor ilegible (p. ej. Keystore reiniciado): se trata como ausente.
    return null;
  }
}

export async function setItem(key: StorageKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function removeItem(key: StorageKey): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignorar: el objetivo (que no exista) ya se cumple.
  }
}
