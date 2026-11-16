"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // No se muestran detalles internos al usuario; el digest sirve para correlacionar logs.
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4 text-center">
      <div role="alert">
        <h1 className="text-2xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-ink-muted">No pudimos cargar esta sección. Inténtalo de nuevo.</p>
        {error.digest && <p className="mt-1 text-xs text-ink-muted">Referencia: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset}>Reintentar</Button>
          <ButtonLink href="/" variant="secondary">Ir al inicio</ButtonLink>
        </div>
      </div>
    </main>
  );
}
