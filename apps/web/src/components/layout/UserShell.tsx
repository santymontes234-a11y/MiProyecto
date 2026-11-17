"use client";

import { BarChart3, Bell, FileWarning, Home, Medal, Route, Settings, Trophy, UserRound, MapPinPlus } from "lucide-react";
import { hasRoleAtLeast } from "@ecomove/shared";
import { useSession } from "@/components/auth/SessionProvider";
import { DashboardShell, type NavItem } from "./DashboardShell";

const NAV: NavItem[] = [
  { href: "/app", label: "Mi panel", icon: Home },
  { href: "/app/viajes/nuevo", label: "Registrar viaje", icon: MapPinPlus },
  { href: "/app/viajes", label: "Historial de viajes", icon: Route },
  { href: "/app/estadisticas", label: "Estadísticas de CO₂", icon: BarChart3 },
  { href: "/app/logros", label: "Logros", icon: Medal },
  { href: "/app/ranking", label: "Ranking", icon: Trophy },
  { href: "/app/notificaciones", label: "Notificaciones", icon: Bell },
  { href: "/app/reportes", label: "Reportar un problema", icon: FileWarning },
  { href: "/app/perfil", label: "Perfil", icon: UserRound },
  { href: "/app/configuracion", label: "Configuración", icon: Settings },
];

export function UserShell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const isAdmin = hasRoleAtLeast(user.role, "ADMIN");
  return (
    <DashboardShell nav={NAV} title="Mi cuenta" switchLink={isAdmin ? { href: "/admin", label: "Ir al panel administrativo" } : undefined}>
      {children}
    </DashboardShell>
  );
}
