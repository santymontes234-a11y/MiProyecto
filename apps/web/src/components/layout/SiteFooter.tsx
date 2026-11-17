import Link from "next/link";
import { BRAND } from "@ecomove/shared";
import { LogoMark } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-brand-strong text-brand-soft">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-semibold text-on-brand">
            <LogoMark /> {BRAND.name}
          </div>
          <p className="mt-3 text-lg font-bold text-on-brand">{BRAND.slogan}</p>
          <p className="mt-3 max-w-md text-sm text-brand-soft/80">
            Plataforma ciudadana para medir, visualizar y premiar la movilidad sostenible en la zona metropolitana de Querétaro.
          </p>
        </div>
        <nav aria-label="Plataforma">
          <h2 className="text-sm font-semibold text-on-brand">Plataforma</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-on-brand" href="/#como-funciona">Cómo funciona</Link></li>
            <li><Link className="hover:text-on-brand" href="/#estadisticas">Estadísticas</Link></li>
            <li><Link className="hover:text-on-brand" href="/registro">Crear cuenta</Link></li>
          </ul>
        </nav>
        <nav aria-label="Información">
          <h2 className="text-sm font-semibold text-on-brand">Información</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-on-brand" href="/movilidad-sostenible">Movilidad sostenible</Link></li>
            <li><Link className="hover:text-on-brand" href="/privacidad">Aviso de privacidad</Link></li>
          </ul>
        </nav>
      </div>
      <p className="border-t border-on-brand/10 py-4 text-center text-xs text-brand-soft/70">© {new Date().getFullYear()} {BRAND.name} · {BRAND.slogan}</p>
    </footer>
  );
}
