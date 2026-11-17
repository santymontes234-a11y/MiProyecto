"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@ecomove/shared";
import { api } from "@/lib/api";
import { emailRequestSchema, type EmailRequestInput } from "@/lib/validation/schemas";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";
import { Spinner } from "@/components/ui/Spinner";
import { useOneTimeToken } from "./useOneTimeToken";

function ResendForm() {
  const [msg, setMsg] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailRequestInput>({ resolver: zodResolver(emailRequestSchema) });
  if (msg) return <div className="mt-4"><Alert tone="info">{msg}</Alert></div>;
  return (
    <form
      noValidate
      className="mt-6 space-y-4"
      onSubmit={handleSubmit(async ({ email }) => {
        try {
          setMsg((await api.auth.requestEmailVerification(email)).message || "Si la cuenta existe, te enviamos un nuevo enlace.");
        } catch {
          setMsg("No se pudo enviar el enlace. Inténtalo más tarde.");
        }
      })}
    >
      <TextField label="Correo electrónico" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <Button type="submit" variant="secondary" loading={isSubmitting}>Enviar nuevo enlace</Button>
    </form>
  );
}

export function VerifyEmailFlow({ token: raw }: { token?: string }) {
  const token = useOneTimeToken(raw);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "invalid" | "error">(token ? "loading" : raw !== undefined ? "invalid" : "idle");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // un token de un solo uso: nunca enviarlo dos veces (StrictMode)
    api.auth
      .confirmEmailVerification(token)
      .then(() => setState("ok"))
      .catch((e: unknown) => setState(e instanceof ApiError && e.code === "VERIFICATION_TOKEN_INVALID" ? "invalid" : "error"));
  }, [token]);

  return (
    <>
      <h1 className="text-[22px] font-bold leading-7">Verificar correo</h1>
      <div className="mt-6" aria-live="polite">
        {state === "loading" && <Spinner className="size-6 text-brand" label="Verificando…" />}
        {state === "ok" && (
          <>
            <Alert tone="success">¡Listo! Tu correo quedó verificado.</Alert>
            <ButtonLink href="/login?verified=1" className="mt-6">Iniciar sesión</ButtonLink>
          </>
        )}
        {state === "invalid" && <Alert tone="error">El enlace caducó, ya se usó o no es válido. Pide uno nuevo.</Alert>}
        {state === "error" && <Alert tone="error">No pudimos verificar tu correo ahora. Inténtalo más tarde.</Alert>}
        {state === "idle" && <p className="text-sm text-ink-muted">¿No te llegó el correo? Pide un enlace nuevo (válido 48 horas).</p>}
      </div>
      {(state === "invalid" || state === "idle" || state === "error") && <ResendForm />}
      <p className="mt-6 text-sm"><Link href="/login" className="font-medium text-brand-strong underline">Volver a iniciar sesión</Link></p>
    </>
  );
}
