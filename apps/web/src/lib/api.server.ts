import "server-only";
import { createApiClient, type StatsSummary } from "@ecomove/shared";

/**
 * Cliente de servidor (Server Components) para endpoints PÚBLICOS del contrato. No maneja
 * tokens: el área privada consulta la API desde el navegador con el access token en memoria.
 */
const baseUrl = process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const serverApi = createApiClient({
  baseUrl,
  getAccessToken: () => null,
  timeoutMs: 5_000,
  fetchImpl: (input, init) => fetch(input, { ...init, next: { revalidate: 300 } }),
});

/** Estadísticas agregadas de la ciudad; null si la API no responde (la landing no se rompe). */
export async function getCityStats(): Promise<StatsSummary | null> {
  try {
    return await serverApi.stats.city();
  } catch {
    return null;
  }
}
