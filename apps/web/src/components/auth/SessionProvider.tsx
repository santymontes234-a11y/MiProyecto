"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasRoleAtLeast, type Role, type User } from "@ecomove/shared";
import { getCachedUser, refreshSession, setCachedUser } from "@/lib/session";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Arranque de sesión del área privada (ADR-003). Al cargar, pide un access token al BFF
 * (refresh en cookie HttpOnly) y recibe el User de la API. El rol NUNCA se lee de
 * almacenamiento del cliente; `requiredRole` solo oculta UI: la API autoriza cada llamada.
 */
interface SessionValue {
  user: User;
  updateUser: (u: User) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ requiredRole = "USER", children }: { requiredRole?: Role; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const redirecting = useRef(false);

  const toLogin = useCallback(() => {
    if (redirecting.current) return;
    redirecting.current = true;
    router.replace(`/login?expired=1&next=${encodeURIComponent(pathname)}`);
  }, [router, pathname]);

  useEffect(() => {
    if (user) return;
    let cancelled = false;
    refreshSession().then((s) => {
      if (cancelled) return;
      if (!s) toLogin();
      else setUser(s.user);
    });
    return () => {
      cancelled = true;
    };
  }, [user, toLogin]);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, toLogin);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, toLogin);
  }, [toLogin]);

  const allowed = !!user && user.is_active && hasRoleAtLeast(user.role, requiredRole);
  useEffect(() => {
    if (user && !allowed) router.replace("/app?forbidden=1");
  }, [user, allowed, router]);

  const updateUser = useCallback((u: User) => {
    setCachedUser(u);
    setUser(u);
  }, []);
  const value = useMemo(() => (user ? { user, updateUser } : null), [user, updateUser]);

  if (!value || !allowed) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-8 text-brand" label="Verificando tu sesión…" />
      </div>
    );
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession debe usarse dentro de SessionProvider");
  return v;
}
