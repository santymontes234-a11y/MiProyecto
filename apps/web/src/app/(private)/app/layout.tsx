import type { Metadata } from "next";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { UserShell } from "@/components/layout/UserShell";

export const metadata: Metadata = { title: { default: "Mi cuenta", template: "%s · Mi cuenta · EcoMove" }, robots: { index: false, follow: false } };

export default function UserAreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider requiredRole="USER">
      <UserShell>{children}</UserShell>
    </SessionProvider>
  );
}
