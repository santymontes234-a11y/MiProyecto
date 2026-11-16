import { createApiClient } from '@ecomove/shared';

import { config } from './config';
import { configureSession, getAccessToken, hasStoredSession, refreshAccessToken } from './session';

type ExpiredHandler = () => void;
let onExpired: ExpiredHandler | null = null;

/** La capa de auth registra aquí qué hacer cuando la sesión deja de ser recuperable. */
export function setSessionExpiredHandler(handler: ExpiredHandler | null): void {
  onExpired = handler;
}

/** Instancia única del cliente tipado de @ecomove/shared. */
export const api = createApiClient({
  baseUrl: config.apiBaseUrl,
  getAccessToken,
  refreshAccessToken,
  onSessionExpired: () => {
    // El cliente también llama aquí si el refresh falló por red. Solo se cierra sesión
    // si el refresh token ya se eliminó, es decir, si el servidor lo rechazó.
    void hasStoredSession().then((stillHasSession) => {
      if (!stillHasSession) onExpired?.();
    });
  },
});

configureSession({ refresh: (rt) => api.auth.refresh(rt), skewMs: config.accessTokenSkewMs });
