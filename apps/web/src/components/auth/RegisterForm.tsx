"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@ecomove/shared";
import { register as registerAccount } from "@/lib/session";
import { registerFormSchema, type RegisterFormInput } from "@/lib/validation/schemas";
import { fieldErrorsFromApi } from "@/lib/validation/api-errors";
import { Button } from "@/components/ui/Button";
import { CheckboxField, TextField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { accept_privacy: false },
  });

  async function onSubmit({ full_name, email, password }: RegisterFormInput) {
    setError(null);
    try {
      const result = await registerAccount({ full_name, email, password });
      if (result.kind === "verify") setVerifyMessage(result.message);
      else router.replace("/app?welcome=1");
    } catch (e) {
      if (e instanceof ApiError && e.code === "EMAIL_ALREADY_REGISTERED") {
        setFieldError("email", { message: "Ya existe una cuenta con este correo" });
      } else if (e instanceof ApiError && e.code === "VALIDATION_ERROR") {
        // Marca el campo que rechazó la API (p. ej. dominios reservados en el correo).
        const fields = fieldErrorsFromApi(e);
        const messages: Record<string, string> = {
          email: "El servidor no acepta este correo. Usa una dirección real.",
          password: "El servidor rechazó la contraseña. Revisa los requisitos.",
          full_name: "El servidor rechazó el nombre.",
        };
        let marked = false;
        for (const f of ["email", "password", "full_name"] as const) {
          if (fields[f]) {
            setFieldError(f, { message: messages[f] });
            marked = true;
          }
        }
        if (!marked) setError("Revisa los datos: la API rechazó el formato de algún campo.");
      } else {
        setError(e instanceof ApiError ? e.message : "No se pudo crear la cuenta.");
      }
    }
  }

  if (verifyMessage) {
    return (
      <div>
        <h1 className="text-[22px] font-bold leading-7">Revisa tu correo</h1>
        <div className="mt-6"><Alert tone="success">{verifyMessage}</Alert></div>
        <p className="mt-4 text-sm text-ink-muted">Abre el enlace que te enviamos para activar tu cuenta y después inicia sesión.</p>
        <Link href="/login" className="mt-6 inline-flex min-h-11 items-center font-medium text-brand-strong underline">Ir a iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[22px] font-bold leading-7">Crea tu cuenta</h1>
      <p className="mt-1 text-sm text-ink-muted">
        ¿Ya tienes cuenta? <Link href="/login" className="font-medium text-brand-strong underline">Inicia sesión</Link>
      </p>
      {error && <div className="mt-6"><Alert tone="error">{error}</Alert></div>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <TextField label="Nombre completo" autoComplete="name" error={errors.full_name?.message} {...register("full_name")} />
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register("email")} />
        <TextField label="Contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con al menos una letra y un número." error={errors.password?.message} {...register("password")} />
        <TextField label="Confirma tu contraseña" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register("confirm_password")} />
        <CheckboxField
          label={<>Acepto el <Link href="/privacidad" className="underline" target="_blank">aviso de privacidad</Link></>}
          error={errors.accept_privacy?.message}
          {...register("accept_privacy")}
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Crear cuenta</Button>
      </form>
    </div>
  );
}
