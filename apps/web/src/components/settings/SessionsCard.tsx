"use client";

import { useRouter } from "next/navigation";
import { Laptop, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { logout } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert, LoadingBlock } from "@/components/ui/StateViews";

function deviceLabel(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Dispositivo desconocido", mobile: false };
  if (/okhttp|android|expo/i.test(ua)) return { label: "App Android", mobile: true };
  const browser = /edg\//i.test(ua) ? "Edge" : /firefox/i.test(ua) ? "Firefox" : /chrome/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "Navegador";
  const os = /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : /iphone|ipad/i.test(ua) ? "iOS" : "";
  return { label: os ? `${browser} en ${os}` : browser, mobile: /mobile|iphone/i.test(ua) };
}

export function SessionsCard() {
  const router = useRouter();
  const sessions = useApiQuery("sessions", () => api.auth.sessions());
  const revoke = useMutation((id: string) => api.auth.revokeSession(id));
  const all = useMutation(() => api.auth.logoutAll());

  return (
    <Card>
      <CardHeader
        title="Sesiones activas"
        description="Dispositivos y navegadores con tu cuenta abierta."
        actions={
          <Button
            variant="danger"
            size="sm"
            loading={all.pending}
            onClick={async () => {
              if ((await all.run()).ok) {
                await logout();
                router.replace("/login?logout=1");
              }
            }}
          >
            Cerrar todas
          </Button>
        }
      />
      {(revoke.error || all.error) && <div className="mb-3"><Alert tone="error">{revoke.error ?? all.error}</Alert></div>}
      {sessions.loading ? (
        <LoadingBlock />
      ) : sessions.error ? (
        <Alert tone="error">{errorMessage(sessions.error)}</Alert>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.data?.map((s) => {
            const d = deviceLabel(s.user_agent);
            const Icon = d.mobile ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Icon className="size-5 text-ink-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{d.label}{s.current && <Badge tone="green" className="ml-2">Este navegador</Badge>}</p>
                  <p className="text-xs text-ink-muted">Último uso: {formatDateTime(s.last_used_at)} · Caduca: {formatDateTime(s.expires_at)}</p>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" onClick={async () => { if ((await revoke.run(s.id)).ok) sessions.refetch(); }}>Cerrar</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
