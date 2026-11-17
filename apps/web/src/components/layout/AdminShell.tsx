"use client";

import { Award, BarChart3, Bus, ClipboardList, FileText, FileWarning, Gauge, Map, MapPin, Route, ShieldCheck, Users } from "lucide-react";
import { hasRoleAtLeast } from "@ecomove/shared";
import { useSession } from "@/components/auth/SessionProvider";
import { DashboardShell, type NavItem } from "./DashboardShell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Gauge },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/viajes", label: "Viajes", icon: Route },
  { href: "/admin/transportes", label: "Medios de transporte", icon: Bus },
  { href: "/admin/estaciones", label: "Estaciones e infraestructura", icon: MapPin },
  { href: "/admin/zonas", label: "Zonas", icon: Map },
  { href: "/admin/logros", label: "Logros", icon: Award },
  { href: "/admin/reportes", label: "Reportes ciudadanos", icon: FileWarning },
  { href: "/admin/informes", label: "Informes CSV/PDF", icon: FileText },
  { href: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { href: "/admin/mapa", label: "Mapa analítico", icon: ClipboardList },
];

const SUPER_NAV: NavItem[] = [{ href: "/admin/auditoria", label: "Auditoría", icon: ShieldCheck }];

/** El menú se adapta al rol devuelto por la API; la API autoriza cada endpoint igualmente. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const nav = hasRoleAtLeast(user.role, "SUPER_ADMIN") ? [...NAV, ...SUPER_NAV] : NAV;
  return (
    <DashboardShell nav={nav} title="Administración" switchLink={{ href: "/app", label: "Ir a mi cuenta" }}>
      {children}
    </DashboardShell>
  );
}
