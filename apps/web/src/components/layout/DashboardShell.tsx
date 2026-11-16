"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { ROLE_LABELS } from "@ecomove/shared";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useSession } from "@/components/auth/SessionProvider";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function DashboardShell({ nav, title, switchLink, children }: { nav: NavItem[]; title: string; switchLink?: { href: string; label: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const root = nav[0]?.href;
  const isActive = (href: string) => (href === root ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1"><Logo href={root} /></div>
      <p className="px-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</p>
      <nav aria-label={title} className="-mt-4 flex-1 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", active ? "bg-brand-soft text-brand-strong" : "text-ink-muted hover:bg-subtle hover:text-ink")}
            >
              <item.icon className="size-4" aria-hidden="true" /> {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-line pt-4">
        {switchLink && (
          <Link href={switchLink.href} className="block rounded-md px-3 py-2 text-sm font-medium text-info hover:bg-info/10">{switchLink.label}</Link>
        )}
        <div className="px-3">
          <p className="truncate text-sm font-medium text-ink">{user.full_name}</p>
          <p className="truncate text-xs text-ink-muted">{user.email} · {ROLE_LABELS[user.role]}</p>
        </div>
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-4 focus:py-2">Saltar al contenido</a>
      <aside className="no-print sticky top-0 hidden h-dvh border-r border-line bg-panel lg:block">{sidebar}</aside>

      <div className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-panel/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo href={root} />
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-subtle" aria-label="Abrir menú" aria-expanded={open} aria-controls="mobile-nav">
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de navegación">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 w-72 bg-panel shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 hover:bg-subtle" aria-label="Cerrar menú">
              <X className="size-5" aria-hidden="true" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main id="contenido" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
