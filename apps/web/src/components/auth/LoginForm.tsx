"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, hasRoleAtLeast } from "@ecomove/shared";
import { login } from "@/lib/session";
import { api } from "@/lib/api";
import { safeNextPath } from "@/lib/auth/redirect";
import { loginSchema, type LoginInput } from "@/lib/validation/schemas";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";

function loginError(e: unknown): string {
  if (!(e instanceof ApiError)) return "No se pudo iniciar sesión.";
  switch (e.code) {
    case "INVALID_CREDENTIALS":
      return "Correo o contraseña incorrectos.";
    case "USER_INACTIVE":
      return "Tu cuenta está desactivada. Contacta a la administración.";
    case "EMAIL_NOT_VERIFIED":
      return "Aún no verificas tu correo. Revisa tu bandeja o pide un nuevo enlace.";
    case "RATE_LIMITED":
      return "Demasiados intentos. Por seguridad la cuenta se bloquea unos minutos; inténtalo más tarde.";
    case "NETWORK_ERROR":
    case "API_UNAVAILABLE":
      return "No pudimos conectar con el servidor de EcoMove.";
    default:
      return e.status === 401 ? "Correo o contraseña incorrectos." : e.message;
  }
}

export function LoginForm({ next, notice }: { next?: string; notice?: { tone: "info" | "success" | "warning"; text: string } | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function resend() {
    if (!unverifiedEmail) return;
    try {
      const r = await api.auth.requestEmailVerification(unverifiedEmail);
      setResent(r.message);
    } catch {
      setResent("No se pudo enviar el enlace. Inténtalo más tarde.");
    }
  }

  async function onSubmit(values: LoginInput) {
    setError(null);
    setUnverifiedEmail(null);
    setResent(null);
    try {
      const user = await login(values);
      // Destino por defecto según el rol devuelto por la API (solo navegación; la API autoriza).
      const fallback = hasRoleAtLeast(user.role, "ADMIN") ? "/admin" : "/app";
      router.replace(safeNextPath(next, fallback));
    } catch (e) {
      setError(loginError(e));
      if (e instanceof ApiError && e.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(values.email);
    }
  }

  return (
    <div>
      <h1 className="text-[22px] font-bold leading-7">Inicia sesión</h1>
      <p className="mt-1 text-sm text-ink-muted">
        ¿No tienes cuenta? <Link href="/registro" className="font-medium text-brand-strong underline">Regístrate</Link>
      </p>
      <div className="mt-6 space-y-3">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {unverifiedEmail && !resent && (
          <button type="button" onClick={resend} className="min-h-11 text-sm font-medium text-brand-strong underline">Reenviar enlace de verificación</button>
        )}
        {resent && <Alert tone="info">{resent}</Alert>}
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register("email")} />
        <TextField label="Contraseña" type="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
        <p className="text-right text-sm">
          <Link href="/restablecer-contrasena" className="font-medium text-brand-strong underline">¿Olvidaste tu contraseña?</Link>
        </p>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Entrar</Button>
      </form>
    </div>
  );
}
