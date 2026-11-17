"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@ecomove/shared";
import { api } from "@/lib/api";
import { emailRequestSchema, resetPasswordSchema, type EmailRequestInput, type ResetPasswordInput } from "@/lib/validation/schemas";
import { fieldErrorsFromApi } from "@/lib/validation/api-errors";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";
import { useOneTimeToken } from "./useOneTimeToken";

function RequestForm() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailRequestInput>({ resolver: zodResolver(emailRequestSchema) });
  return (
    <>
      <h1 className="text-[22px] font-bold leading-7">Restablecer contraseña</h1>
      <p className="mt-1 text-sm text-ink-muted">Te enviaremos un enlace válido durante 30 minutos.</p>
      <div className="mt-6 space-y-3">
        {done && <Alert tone="success">{done}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
      {!done && (
        <form
          noValidate
          className="mt-6 space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            setError(null);
            try {
              // Siempre 202, exista o no la cuenta (no revela correos registrados).
              const r = await api.auth.requestPasswordReset(email);
              setDone(r.message || "Si el correo está registrado, recibirás un enlace en unos minutos.");
            } catch (e) {
              setError(e instanceof ApiError && e.code === "RATE_LIMITED" ? "Demasiadas solicitudes. Inténtalo más tarde." : "No se pudo enviar la solicitud.");
            }
          })}
        >
          <TextField label="Correo electrónico" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Enviar enlace</Button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link href="/login" className="font-medium text-brand-strong underline">Volver a iniciar sesión</Link></p>
    </>
  );
}

function ConfirmForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });
  return (
    <>
      <h1 className="text-[22px] font-bold leading-7">Nueva contraseña</h1>
      <p className="mt-1 text-sm text-ink-muted">Al cambiarla se cerrarán todas tus sesiones.</p>
      {error && <div className="mt-6"><Alert tone="error">{error}</Alert></div>}
      <form
        noValidate
        className="mt-6 space-y-4"
        onSubmit={handleSubmit(async ({ new_password }) => {
          setError(null);
          try {
            await api.auth.confirmPasswordReset(token, new_password);
            router.replace("/login?reset=1");
          } catch (e) {
            if (e instanceof ApiError && e.code === "RESET_TOKEN_INVALID") setError("El enlace caducó o ya se usó. Pide uno nuevo.");
            else if (fieldErrorsFromApi(e).new_password) setFieldError("new_password", { message: "El servidor rechazó la contraseña. Revisa los requisitos." });
            else setError(e instanceof ApiError ? e.message : "No se pudo restablecer la contraseña.");
          }
        })}
      >
        <TextField label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con al menos una letra y un número." error={errors.new_password?.message} {...register("new_password")} />
        <TextField label="Confirma la contraseña" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register("confirm_password")} />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Guardar contraseña</Button>
      </form>
      {error && <p className="mt-4 text-sm"><Link href="/restablecer-contrasena" className="font-medium text-brand-strong underline">Pedir un enlace nuevo</Link></p>}
    </>
  );
}

export function ResetPasswordFlow({ token: raw }: { token?: string }) {
  const token = useOneTimeToken(raw);
  if (raw !== undefined && !token) {
    return (
      <>
        <h1 className="text-[22px] font-bold leading-7">Enlace no válido</h1>
        <div className="mt-6"><Alert tone="error">El enlace está incompleto o dañado.</Alert></div>
        <p className="mt-4 text-sm"><Link href="/restablecer-contrasena" className="font-medium text-brand-strong underline">Pedir un enlace nuevo</Link></p>
      </>
    );
  }
  return token ? <ConfirmForm token={token} /> : <RequestForm />;
}
