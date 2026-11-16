import type { Metadata } from "next";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { AdminShell } from "@/components/layout/AdminShell";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Admin · EcoMove" }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider requiredRole="ADMIN">
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
