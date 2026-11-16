"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { ButtonLink } from "@/components/ui/Button";

const links = [
  { href: "/#proyecto", label: "Proyecto" },
  { href: "/#beneficios", label: "Beneficios" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/estadisticas", label: "Estadísticas" },
  { href: "/mapa", label: "Mapa" },
  { href: "/movilidad-sostenible", label: "Movilidad sostenible" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-panel/95 backdrop-blur">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-4 focus:py-2">Saltar al contenido</a>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />
        <nav aria-label="Principal" className="hidden items-center gap-1 xl:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-subtle hover:text-ink">{l.label}</Link>
          ))}
        </nav>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <ButtonLink href="/login" variant="ghost">Iniciar sesión</ButtonLink>
          <ButtonLink href="/registro">Crear cuenta</ButtonLink>
        </div>
        <button type="button" className="rounded-lg p-2 hover:bg-subtle xl:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="public-mobile-nav" aria-label={open ? "Cerrar menú" : "Abrir menú"}>
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav id="public-mobile-nav" aria-label="Principal móvil" className="border-t border-line bg-panel px-4 pb-4 xl:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-subtle">{l.label}</Link>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
            <ButtonLink href="/login" variant="secondary">Iniciar sesión</ButtonLink>
            <ButtonLink href="/registro">Crear cuenta</ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}
