import { ApiError, type TokenPair, type User } from '@ecomove/shared';
import * as SecureStore from 'expo-secure-store';

import { StorageKeys } from '../secure-storage';
import {
  __resetSessionForTests,
  configureSession,
  getAccessToken,
  getStoredRefreshToken,
  refreshSession,
  storeTokenPair,
  subscribeSession,
} from '../session';

const user: User = { id: 'u1', email: 'ana@correo.com', full_name: 'Ana', role: 'USER', is_active: true, created_at: '2026-11-15T00:00:00Z', email_verified: true, ranking_opt_in: false };
const pair = (n: number, expiresIn = 900): TokenPair => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  token_type: 'bearer',
  expires_in: expiresIn,
  user,
});

beforeEach(async () => {
  __resetSessionForTests();
  await SecureStore.deleteItemAsync(StorageKeys.refreshToken);
  jest.clearAllMocks();
});

describe('session', () => {
  it('guarda solo el refresh en SecureStore y el access en memoria', async () => {
    configureSession({ refresh: jest.fn() });
    await storeTokenPair(pair(1));
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(StorageKeys.refreshToken, 'refresh-1', expect.anything());
    expect(await getAccessToken()).toBe('access-1');
  });

  it('refresh single-flight: llamadas concurrentes rotan una sola vez y guardan el refresh nuevo', async () => {
    await SecureStore.setItemAsync(StorageKeys.refreshToken, 'refresh-0');
    let resolve: (p: TokenPair) => void = () => undefined;
    const pending = new Promise<TokenPair>((r) => (resolve = r));
    const refresh = jest.fn(() => pending);
    configureSession({ refresh });

    const a = refreshSession();
    const b = refreshSession();
    resolve(pair(1));
    const [ra, rb] = await Promise.all([a, b]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('refresh-0');
    expect(ra?.access_token).toBe('access-1');
    expect(rb).toBe(ra);
    expect(await getStoredRefreshToken()).toBe('refresh-1');
  });

  it('renueva proactivamente cuando el access está por expirar', async () => {
    let now = 1_000_000;
    const refresh = jest.fn(async () => pair(2));
    configureSession({ refresh, now: () => now, skewMs: 30_000 });
    await storeTokenPair(pair(1, 60));
    expect(await getAccessToken()).toBe('access-1');
    now += 45_000; // quedan 15 s < margen de 30 s
    expect(await getAccessToken()).toBe('access-2');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('401 en refresh limpia la sesión y emite "expired"', async () => {
    await SecureStore.setItemAsync(StorageKeys.refreshToken, 'refresh-viejo');
    configureSession({ refresh: jest.fn(async () => Promise.reject(new ApiError(401, 'TOKEN_INVALID', 'x'))) });
    const events: string[] = [];
    subscribeSession((e) => events.push(e.type));
    await expect(refreshSession()).resolves.toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
    expect(events).toEqual(['expired']);
  });

  it('un error de red NO borra el refresh guardado', async () => {
    await SecureStore.setItemAsync(StorageKeys.refreshToken, 'refresh-1');
    configureSession({ refresh: jest.fn(async () => Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'x'))) });
    await expect(refreshSession()).rejects.toBeInstanceOf(ApiError);
    expect(await getStoredRefreshToken()).toBe('refresh-1');
  });

  it('sin refresh guardado no llama al servidor', async () => {
    const refresh = jest.fn();
    configureSession({ refresh });
    await expect(refreshSession()).resolves.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
