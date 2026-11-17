"use client";

import { useEffect, useState } from "react";
import { oneTimeTokenSchema } from "@/lib/validation/schemas";

/**
 * Lee el token de un solo uso de ?token= (enlaces de correo, contrato §2.1) y lo quita de la
 * barra de direcciones para que no quede en el historial ni se filtre por Referer.
 */
export function useOneTimeToken(initial: string | undefined): string | null | undefined {
  const [token] = useState<string | null>(() => {
    if (!initial) return null;
    return oneTimeTokenSchema.safeParse(initial).success ? initial : null;
  });
  useEffect(() => {
    if (initial && typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
  }, [initial]);
  return initial === undefined ? undefined : token;
}
