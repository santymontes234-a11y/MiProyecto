/**
 * Cliente de sesión del navegador (ADR-003): el access token vive solo en memoria;
 * el refresh token lo guarda el BFF (/api/session/*) en una cookie HttpOnly.
 * Nada se guarda en localStorage/sessionStorage.
 */
import { ApiError, isApiErrorBody, type LoginRequest, type RegisterRequest, type User } from "@ecomove/shared";
import { CSRF_HEADER } from "./auth/csrf";

let accessToken: string | null = null;
let currentUser: User | null = null;
let refreshInFlight: Promise<SessionData | null> | null = null;

export interface SessionData {
  access_token: string;
  expires_in: number;
  user: User;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Último User devuelto por la API en esta pestaña (memoria). Solo para pintar la UI. */
export function getCachedUser(): User | null {
  return accessToken ? currentUser : null;
}

export function setCachedUser(user: User): void {
  currentUser = user;
}

async function post(path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { [CSRF_HEADER]: "1" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    return await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Sin conexión. Revisa tu red e inténtalo de nuevo.");
  }
}

async function toError(res: Response): Promise<ApiError> {
  const data: unknown = await res.json().catch(() => null);
  if (isApiErrorBody(data)) return new ApiError(res.status, data.error.code, data.error.message, data.error.details);
  return new ApiError(res.status, "INTERNAL_ERROR", "No se pudo completar la solicitud");
}

async function establish(res: Response): Promise<User> {
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as SessionData;
  accessToken = data.access_token;
  currentUser = data.user;
  return data.user;
}

export async function login(credentials: LoginRequest): Promise<User> {
  return establish(await post("/api/session/login", credentials));
}

export type RegisterResult = { kind: "session"; user: User } | { kind: "verify"; message: string };

/** Contrato 1.1 §2.2: 201 con sesión o 202 «verifica tu correo» sin tokens. */
export async function register(body: RegisterRequest): Promise<RegisterResult> {
  const res = await post("/api/session/register", body);
  if (res.status === 202) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { kind: "verify", message: data.message ?? "Revisa tu correo para activar la cuenta." };
  }
  return { kind: "session", user: await establish(res) };
}

/**
 * Renueva la sesión con el refresh de la cookie. Single-flight: el refresh rota el token y
 * la API revoca toda la familia si recibe uno ya usado, así que nunca se lanzan dos a la vez.
 */
export function refreshSession(): Promise<SessionData | null> {
  if (!refreshInFlight) {
    refreshInFlight = post("/api/session/refresh")
      .then(async (res) => {
        if (!res.ok) {
          accessToken = null;
          currentUser = null;
          return null;
        }
        const data = (await res.json()) as SessionData;
        accessToken = data.access_token;
        currentUser = data.user;
        return data;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function refreshAccessToken(): Promise<string | null> {
  const s = await refreshSession();
  return s?.access_token ?? null;
}

export async function logout(): Promise<void> {
  await post("/api/session/logout").catch(() => null);
  accessToken = null;
  currentUser = null;
}
