"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Trash2 } from "lucide-react";
import { ApiError } from "@ecomove/shared";
import { api } from "@/lib/api";
import { logout } from "@/lib/session";
import { downloadBlob, timestampedName } from "@/lib/export";
import { deleteAccountSchema, type DeleteAccountInput } from "@/lib/validation/schemas";
import { fieldErrorsFromApi } from "@/lib/validation/api-errors";
import { errorMessage } from "@/hooks/useApiQuery";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Fields";
import { Alert } from "@/components/ui/StateViews";

export function PrivacyCard() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<DeleteAccountInput>({ resolver: zodResolver(deleteAccountSchema) });

  async function exportData() {
    setExporting(true);
    setExportError(null);
    try {
      downloadBlob(await api.users.exportData(), timestampedName("ecomove-mis-datos", "json"));
    } catch (e) {
      setExportError(e instanceof ApiError ? errorMessage(e) : "No se pudo exportar.");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete({ password }: DeleteAccountInput) {
    setDeleteError(null);
    try {
      await api.users.deleteAccount({ password });
      await logout();
      router.replace("/login?deleted=1");
    } catch (e) {
      // Contrato: contraseña incorrecta → 422 (no 401).
      if (fieldErrorsFromApi(e).password) setError("password", { message: "La contraseña no es correcta" });
      else if (e instanceof ApiError && e.status === 403) setDeleteError("No puedes eliminar la cuenta del último superadministrador activo.");
      else setDeleteError(e instanceof ApiError ? errorMessage(e) : "No se pudo eliminar la cuenta.");
    }
  }

  return (
    <Card>
      <CardHeader title="Privacidad y datos" description="Derechos ARCO (LFPDPPP)." />
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-ink-muted">Descarga todos tus datos (perfil, viajes con trazas, logros, notificaciones y reportes) en formato JSON.</p>
          <Button variant="secondary" size="sm" className="mt-2" loading={exporting} onClick={exportData}>
            {!exporting && <Download className="size-4" aria-hidden="true" />} Descargar mis datos
          </Button>
          {exportError && <p role="alert" className="mt-2 text-alert">{exportError}</p>}
        </div>
        <div className="border-t border-line pt-4">
          <p className="text-ink-muted">Eliminar tu cuenta borra tus viajes, trazas, logros, preferencias y notificaciones. No se puede deshacer.</p>
          <Button variant="danger" size="sm" className="mt-2" onClick={() => { reset(); setDeleteError(null); setOpen(true); }}>
            <Trash2 className="size-4" aria-hidden="true" /> Eliminar mi cuenta
          </Button>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Eliminar cuenta definitivamente">
        <form noValidate onSubmit={handleSubmit(onDelete)} className="space-y-4">
          <Alert tone="warning">Se borrarán todos tus datos de forma permanente. Los reportes ciudadanos se conservan de forma anónima.</Alert>
          {deleteError && <Alert tone="error">{deleteError}</Alert>}
          <TextField label="Contraseña" type="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
          <TextField label="Escribe ELIMINAR para confirmar" autoComplete="off" error={errors.confirm?.message} {...register("confirm")} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="danger" loading={isSubmitting}>Eliminar</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
