import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';

/**
 * Ruta "/" (arranque del APK). Las rutas de (auth) y (app) están protegidas y ninguna era "/"
 * fuera de la protección, así que sin sesión el arranque caía en «Unmatched Route».
 */
export default function Index() {
  const { status } = useAuth();
  const { done } = useOnboarding();
  if (status === 'signedIn') return <Redirect href="/home" />;
  return <Redirect href={done ? '/login' : '/onboarding'} />;
}
