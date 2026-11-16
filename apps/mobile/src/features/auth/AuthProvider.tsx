import { isTokenPair, type LoginRequest, type RegisterRequest, type User } from '@ecomove/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { api, setSessionExpiredHandler } from '@/lib/api';
import { clearSession, getStoredRefreshToken, hasStoredSession, refreshSession, storeTokenPair, subscribeSession } from '@/lib/session';

/**
 * Estados de autenticación:
 * - loading:   arranque, renovando la sesión guardada.
 * - offline:   hay sesión guardada, pero no se pudo contactar a la API (se ofrece reintentar).
 * - signedOut / signedIn.
 */
export type AuthStatus = 'loading' | 'offline' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** true si la última salida fue por expiración (para avisar en login). */
  sessionExpired: boolean;
  signIn: (body: LoginRequest) => Promise<void>;
  /** 'signedIn' o, con verificación obligatoria (contrato §2.2), 'verify_email' + mensaje del servidor. */
  signUp: (body: RegisterRequest) => Promise<{ result: 'signedIn' } | { result: 'verify_email'; message: string }>;
  signOut: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const mounted = useRef(true);

  const toSignedOut = useCallback(
    (expired: boolean) => {
      setUser(null);
      setStatus('signedOut');
      setSessionExpired(expired);
      queryClient.clear();
    },
    [queryClient],
  );

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    if (!(await hasStoredSession())) {
      toSignedOut(false);
      return;
    }
    try {
      const pair = await refreshSession();
      if (!mounted.current) return;
      if (pair) {
        setUser(pair.user);
        setStatus('signedIn');
      } else {
        toSignedOut(true);
      }
    } catch {
      // Error transitorio (red): no se borra la sesión guardada.
      if (mounted.current) setStatus('offline');
    }
  }, [toSignedOut]);

  useEffect(() => {
    mounted.current = true;
    // Sincroniza con sistemas externos (SecureStore + API) al montar: es el uso previsto de un efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void bootstrap();
    const unsubscribe = subscribeSession((event) => {
      if (event.type === 'refreshed') setUser(event.user);
      else toSignedOut(true);
    });
    setSessionExpiredHandler(() => toSignedOut(true));
    return () => {
      mounted.current = false;
      unsubscribe();
      setSessionExpiredHandler(null);
    };
  }, [bootstrap, toSignedOut]);

  const signIn = useCallback(async (body: LoginRequest) => {
    const pair = await api.auth.login({ email: body.email.trim().toLowerCase(), password: body.password });
    await storeTokenPair(pair);
    setUser(pair.user);
    setSessionExpired(false);
    setStatus('signedIn');
  }, []);

  const signUp = useCallback(async (body: RegisterRequest) => {
    const res = await api.auth.register({
      email: body.email.trim().toLowerCase(),
      password: body.password,
      full_name: body.full_name.trim(),
    });
    if (!isTokenPair(res)) return { result: 'verify_email' as const, message: res.message };
    await storeTokenPair(res);
    setUser(res.user);
    setSessionExpired(false);
    setStatus('signedIn');
    return { result: 'signedIn' as const };
  }, []);

  const signOut = useCallback(async () => {
    const rt = await getStoredRefreshToken();
    if (rt) {
      try {
        await api.auth.logout(rt);
      } catch {
        // Mejor esfuerzo: aunque falle la red, la sesión local se elimina.
      }
    }
    await clearSession();
    toSignedOut(false);
  }, [toSignedOut]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, signIn, signUp, signOut, retryBootstrap: bootstrap, setUser }),
    [status, user, sessionExpired, signIn, signUp, signOut, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
