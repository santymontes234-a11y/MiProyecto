import { createApiClient } from "@ecomove/shared";
import { getAccessToken, refreshAccessToken } from "./session";

/** Evento que escucha SessionProvider para llevar a /login cuando la sesión no es recuperable. */
export const SESSION_EXPIRED_EVENT = "ecomove:session-expired";

/**
 * Cliente único de la API (contrato 1.0.0). El navegador habla directo con la API con el
 * access token en memoria; NEXT_PUBLIC_API_BASE_URL es una URL pública, no un secreto.
 */
export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
  getAccessToken,
  refreshAccessToken,
  onSessionExpired: () => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  },
});
