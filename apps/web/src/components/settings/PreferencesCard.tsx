"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, MODE_LABELS, TRANSPORT_MODES, VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type Preferences, type TransportMode, type VehicleType } from "@ecomove/shared";
import { api } from "@/lib/api";
import { preferencesSchema, type PreferencesInput } from "@/lib/validation/schemas";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { Card, CardHeader } from "@/components/ui/Card";
import { CheckboxField, SelectField, TextField } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Alert, LoadingBlock } from "@/components/ui/StateViews";

export function PreferencesCard() {
  const prefs = useApiQuery("prefs", () => api.users.preferences());
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<PreferencesInput>({ resolver: zodResolver(preferencesSchema) });

  useEffect(() => {
    if (prefs.data) reset(toForm(prefs.data));
  }, [prefs.data, reset]);

  async function onSubmit(v: PreferencesInput) {
    setStatus(null);
    try {
      const saved = await api.users.updatePreferences({
        language: v.language,
        default_mode: v.default_mode ? (v.default_mode as TransportMode) : null,
        default_vehicle_type: v.default_vehicle_type ? (v.default_vehicle_type as VehicleType) : null,
        weekly_goal_trips: v.weekly_goal_trips === "" ? null : v.weekly_goal_trips,
        email_notifications: v.email_notifications,
      });
      reset(toForm(saved));
      setStatus({ tone: "success", text: "Preferencias guardadas." });
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof ApiError ? errorMessage(e) : "No se pudieron guardar." });
    }
  }

  return (
    <Card>
      <CardHeader title="Preferencias" description="Se comparten con la app Android." />
      {prefs.loading ? (
        <LoadingBlock />
      ) : prefs.error ? (
        <Alert tone="error">{errorMessage(prefs.error)}</Alert>
      ) : (
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {status && <Alert tone={status.tone}>{status.text}</Alert>}
          <SelectField label="Idioma" options={[{ value: "es", label: "Español" }, { value: "en", label: "English" }]} {...register("language")} />
          <SelectField label="Medio de transporte habitual" options={[{ value: "", label: "Sin preferencia" }, ...TRANSPORT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))]} {...register("default_mode")} />
          <SelectField
            label="Tipo de auto habitual"
            hint="Se usa para calcular el CO₂ de tus viajes en auto o auto compartido."
            options={[{ value: "", label: "Sin especificar (sedán)" }, ...VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] }))]}
            {...register("default_vehicle_type")}
          />
          <TextField label="Meta semanal de viajes" type="number" min={1} max={100} inputMode="numeric" hint="Déjalo vacío si no quieres meta." error={errors.weekly_goal_trips?.message} {...register("weekly_goal_trips")} />
          <CheckboxField label="Recibir avisos por correo" description="Resumen semanal y logros." {...register("email_notifications")} />
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Guardar preferencias</Button>
        </form>
      )}
    </Card>
  );
}

function toForm(p: Preferences): PreferencesInput {
  return {
    language: p.language,
    default_mode: p.default_mode ?? "",
    default_vehicle_type: p.default_vehicle_type ?? "",
    weekly_goal_trips: p.weekly_goal_trips ?? "",
    email_notifications: p.email_notifications,
  };
}
