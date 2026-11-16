import { ButtonLink } from "@/components/ui/Button";
import { LogoMark } from "@/components/layout/Logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <LogoMark className="mx-auto size-12" />
        <p className="mt-6 text-sm font-semibold text-brand-strong">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Esta ruta no existe</h1>
        <p className="mt-2 text-ink-muted">Quizá el enlace cambió o se tomó otra ciclovía.</p>
        <ButtonLink href="/" className="mt-6">Volver al inicio</ButtonLink>
      </div>
    </main>
  );
}
