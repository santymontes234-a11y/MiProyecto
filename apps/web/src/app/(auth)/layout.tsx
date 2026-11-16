import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <main id="contenido" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-xs text-ink-muted">
          <Link href="/privacidad" className="underline">Aviso de privacidad</Link>
        </p>
      </div>
      <aside className="hidden flex-col justify-end bg-brand-strong p-12 text-brand-soft lg:flex" aria-hidden="true">
        <p className="text-[32px] font-bold leading-10">Cada trayecto sostenible cuenta.</p>
        <p className="mt-3 max-w-md text-brand-soft/80">Usa la misma cuenta en la web y en la app Android de EcoMove Querétaro.</p>
      </aside>
    </div>
  );
}
