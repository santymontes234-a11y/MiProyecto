import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión", alternates: { canonical: "/login" } };

type SP = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const notice = one(sp.password_changed)
    ? ({ tone: "success", text: "Contraseña actualizada. Por seguridad se cerraron todas tus sesiones: inicia sesión de nuevo." } as const)
    : one(sp.reset)
      ? ({ tone: "success", text: "Tu contraseña se restableció. Ya puedes iniciar sesión." } as const)
      : one(sp.verified)
        ? ({ tone: "success", text: "Correo verificado. Ya puedes iniciar sesión." } as const)
        : one(sp.deleted)
          ? ({ tone: "info", text: "Tu cuenta y tus datos se eliminaron." } as const)
          : one(sp.expired)
    ? ({ tone: "warning", text: "Tu sesión expiró o no es válida. Inicia sesión de nuevo." } as const)
    : one(sp.logout)
      ? ({ tone: "success", text: "Cerraste sesión correctamente." } as const)
      : null;

  return <LoginForm next={one(sp.next)} notice={notice} />;
}
