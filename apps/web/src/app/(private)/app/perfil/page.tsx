"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ROLE_LABELS } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { errorMessage } from "@/hooks/useApiQuery";
import { ApiError } from "@ecomove/shared";
import { profileSchema, type ProfileInput } from "@/lib/validation/schemas";
import { useSession } from "@/components/auth/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/StateViews";
import { Badge } from "@/components/ui/Badge";

export default function ProfilePage() {
  const { user, updateUser } = useSession();
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user.full_name },
  });

  async function onSubmit(values: ProfileInput) {
    setStatus(null);
    try {
      const updated = await api.users.updateMe(values);
      updateUser(updated);
      reset({ full_name: updated.full_name });
      setStatus({ tone: "success", text: "Perfil actualizado." });
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof ApiError ? errorMessage(e) : "No se pudo guardar." });
    }
  }

  return (
    <>
      <PageHeader title="Perfil" description="Tus datos de cuenta en EcoMove." />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Datos personales" />
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-md space-y-4">
            {status && <Alert tone={status.tone}>{status.text}</Alert>}
            <TextField label="Nombre completo" autoComplete="name" error={errors.full_name?.message} {...register("full_name")} />
            <TextField label="Correo electrónico" value={user.email} readOnly disabled hint="El correo no se puede cambiar desde la web." />
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Guardar cambios</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Cuenta" />
          <dl className="space-y-3 text-sm">
            <div><dt className="text-ink-muted">Rol</dt><dd className="mt-0.5"><Badge tone="green">{ROLE_LABELS[user.role]}</Badge></dd></div>
            <div><dt className="text-ink-muted">Miembro desde</dt><dd className="mt-0.5 font-medium">{formatDate(user.created_at)}</dd></div>
            <div><dt className="text-ink-muted">Estado</dt><dd className="mt-0.5 font-medium">{user.is_active ? "Activa" : "Desactivada"}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
