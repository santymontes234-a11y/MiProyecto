"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@ecomove/shared";
import { api } from "@/lib/api";
import { logout } from "@/lib/session";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/schemas";
import { fieldErrorsFromApi } from "@/lib/validation/api-errors";
import { errorMessage } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/StateViews";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function SettingsPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit({ current_password, new_password }: ChangePasswordInput) {
    setError(null);
    try {
      await api.users.changePassword({ current_password, new_password });
      // Contrato 1.1: revoca todos los refresh y también los access → hay que iniciar sesión de nuevo.
      await logout();
      router.replace("/login?password_changed=1&next=/app");
    } catch (e) {
      // Contrato 1.0.1: contraseña actual incorrecta → 422 VALIDATION_ERROR con loc current_password
      // (no 401, así que la sesión sigue activa y no se redirige al login).
      const fields = fieldErrorsFromApi(e);
      if (fields.current_password) {
        setFieldError("current_password", { message: "La contraseña actual no es correcta" });
      } else if (fields.new_password) {
        setFieldError("new_password", { message: fields.new_password });
      } else {
        setError(e instanceof ApiError ? errorMessage(e) : "No se pudo cambiar la contraseña.");
      }
    }
  }

  return (
    <>
      <PageHeader title="Configuración" description="Seguridad y privacidad de tu cuenta." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cambiar contraseña" description="Al cambiarla se cerrará la sesión en todos tus dispositivos." />
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <TextField label="Contraseña actual" type="password" autoComplete="current-password" error={errors.current_password?.message} {...register("current_password")} />
            <TextField label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con al menos una letra y un número." error={errors.new_password?.message} {...register("new_password")} />
            <TextField label="Confirma la nueva contraseña" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register("confirm_password")} />
            <Button type="submit" loading={isSubmitting}>Actualizar contraseña</Button>
          </form>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Sesión" description="Cierra la sesión en este navegador." />
            <LogoutButton className="w-auto border border-line" />
          </Card>
          <Card>
            <CardHeader title="Privacidad" />
            <ul className="list-disc space-y-2 pl-5 text-sm text-ink-muted">
              <li>Tus recorridos GPS solo los ves tú; la administración consulta datos agregados.</li>
              <li>Puedes exportar tu historial completo en CSV desde «Historial de viajes».</li>
              <li>La eliminación de cuenta llegará en una próxima versión (etapa 5 del plan).</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
