"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/components/auth/SessionProvider";
import { Alert } from "@/components/ui/StateViews";

/** Aviso si el correo no está verificado (User.email_verified, contrato 1.1). */
export function EmailVerificationBanner() {
  const { user } = useSession();
  const [sent, setSent] = useState<string | null>(null);
  if (user.email_verified) return null;
  return (
    <div className="mb-6">
      <Alert tone="warning">
        Tu correo aún no está verificado.{" "}
        {sent ?? (
          <button
            type="button"
            className="font-medium underline"
            onClick={async () => {
              try {
                setSent((await api.auth.requestEmailVerification(user.email)).message || "Te enviamos un enlace.");
              } catch {
                setSent("No se pudo enviar el enlace. Inténtalo más tarde.");
              }
            }}
          >
            Enviar enlace de verificación
          </button>
        )}
      </Alert>
    </div>
  );
}
