"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/session";
import { cn } from "@/lib/cn";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    await logout();
    router.replace("/login?logout=1");
    router.refresh();
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className={cn("flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-alert/10 hover:text-alert", className)}>
      <LogOut className="size-4" aria-hidden="true" /> {busy ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
