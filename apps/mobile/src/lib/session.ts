/**
 * Gestión de sesión (ADR-003):
 *  - access token SOLO en memoria;
 *  - refresh token en expo-secure-store, reemplazado SIEMPRE por el nuevo tras cada rotación;
 *  - renovación single-flight, compartida entre la renovación proactiva y la reactiva (401).
 * No depende de React; la UI se suscribe con `subscribeSession`.
 */
import { ApiError, type TokenPair, type User } from '@ecomove/shared';

import { getItem, removeItem, setItem, StorageKeys } from './secure-storage';

export type SessionEvent = { type: 'refreshed'; user: User } | { type: 'expired' };
type Listener = (event: SessionEvent) => void;
type RefreshFn = (refreshToken: string) => Promise<TokenPair>;

interface State {
  accessToken: string | null;
  expiresAt: number;
  refreshFn: RefreshFn | null;
  inFlight: Promise<TokenPair | null> | null;
  skewMs: number;
  now: () => number;
}

const state: State = { accessToken: null, expiresAt: 0, refreshFn: null, inFlight: null, skewMs: 30_000, now: Date.now };
const listeners = new Set<Listener>();

export function configureSession(opts: { refresh: RefreshFn; skewMs?: number; now?: () => number }): void {
  state.refreshFn = opts.refresh;
  if (opts.skewMs !== undefined) state.skewMs = opts.skewMs;
  if (opts.now) state.now = opts.now;
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: SessionEvent): void {
  listeners.forEach((l) => l(event));
}

/** Guarda un TokenPair recién emitido (login, registro o refresh). */
export async function storeTokenPair(pair: TokenPair): Promise<void> {
  await setItem(StorageKeys.refreshToken, pair.refresh_token);
  state.accessToken = pair.access_token;
  state.expiresAt = state.now() + pair.expires_in * 1000;
}

export async function clearSession(): Promise<void> {
  state.accessToken = null;
  state.expiresAt = 0;
  await removeItem(StorageKeys.refreshToken);
}

export const getStoredRefreshToken = (): Promise<string | null> => getItem(StorageKeys.refreshToken);

export async function hasStoredSession(): Promise<boolean> {
  return (await getStoredRefreshToken()) !== null;
}

/** Errores que indican que el refresh ya no es válido (frente a fallos de red transitorios). */
export function isDefinitiveAuthFailure(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

/**
 * Rota el refresh token. Single-flight: las llamadas concurrentes comparten la misma promesa,
 * así nunca se reutiliza un refresh ya rotado, lo que revocaría toda la familia de tokens.
 * - Devuelve el TokenPair nuevo, o null si no hay sesión o el servidor la rechazó (se limpia).
 * - Lanza el error si es transitorio (red o timeout), y conserva el refresh para reintentar.
 */
export function refreshSession(): Promise<TokenPair | null> {
  if (state.inFlight) return state.inFlight;
  const run = async (): Promise<TokenPair | null> => {
    const refreshFn = state.refreshFn;
    if (!refreshFn) throw new Error('Sesión no configurada: llama a configureSession()');
    const rt = await getStoredRefreshToken();
    if (!rt) return null;
    try {
      const pair = await refreshFn(rt);
      await storeTokenPair(pair);
      emit({ type: 'refreshed', user: pair.user });
      return pair;
    } catch (e) {
      if (isDefinitiveAuthFailure(e)) {
        await clearSession();
        emit({ type: 'expired' });
        return null;
      }
      throw e;
    }
  };
  state.inFlight = run().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

/** Para el cliente HTTP: renueva de forma proactiva si el access está por expirar. */
export async function getAccessToken(): Promise<string | null> {
  if (state.accessToken && state.expiresAt - state.now() > state.skewMs) return state.accessToken;
  if (!(await hasStoredSession())) return state.accessToken;
  try {
    const pair = await refreshSession();
    return pair?.access_token ?? null;
  } catch {
    // Sin red: se intenta con el token actual; si da 401, el cliente reintentará.
    return state.accessToken;
  }
}

/** Para el cliente HTTP (`refreshAccessToken`), tras un 401. */
export async function refreshAccessToken(): Promise<string | null> {
  const pair = await refreshSession();
  return pair?.access_token ?? null;
}

/** Solo para tests. */
export function __resetSessionForTests(): void {
  state.accessToken = null;
  state.expiresAt = 0;
  state.inFlight = null;
  state.refreshFn = null;
  state.now = Date.now;
  state.skewMs = 30_000;
  listeners.clear();
}
