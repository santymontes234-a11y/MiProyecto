"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@ecomove/shared";

export interface QueryState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "Error inesperado");
}

/**
 * Lectura con estados de carga/error y descarte de respuestas obsoletas. `fetcher` llama a un
 * método del cliente de `@ecomove/shared`; `key` identifica los parámetros (se re-ejecuta al cambiar).
 * Con `key === null` no se consulta.
 */
export function useApiQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (key === null) {
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((d) => {
        if (!stale) setData(d);
      })
      .catch((e: unknown) => {
        if (!stale) setError(toApiError(e));
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [key, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refetch };
}

export type MutationResult<R> = { ok: true; data: R } | { ok: false; error: ApiError };

/** Ejecuta una mutación con estado de envío y error legible. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A): Promise<MutationResult<R>> => {
      setPending(true);
      setError(null);
      try {
        return { ok: true, data: await fn(...args) };
      } catch (e) {
        const err = toApiError(e);
        setError(errorMessage(err));
        return { ok: false, error: err };
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, setError };
}

/** Mensaje en español para errores frecuentes del contrato. */
export function errorMessage(e: ApiError | null | undefined): string {
  if (!e) return "";
  switch (e.code) {
    case "NETWORK_ERROR":
      return "Sin conexión con el servidor de EcoMove.";
    case "TIMEOUT":
      return "El servidor tardó demasiado en responder.";
    case "FORBIDDEN":
      return "No tienes permisos para ver esta información.";
    case "RATE_LIMITED":
      return "Demasiadas solicitudes. Espera un momento.";
    default:
      return e.message || "Ocurrió un error.";
  }
}
