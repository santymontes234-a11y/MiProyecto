import Link from "next/link";
import { BRAND, LOGO_SVG } from "@ecomove/shared";

/**
 * Logo oficial (LOGO_SVG de @ecomove/shared, original en docs/brand/logo.svg). Es una constante
 * del paquete, sin datos de usuario, por eso se inserta como SVG en línea.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 [&>svg]:block [&>svg]:size-full ${className}`} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />;
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold text-brand-strong" aria-label={`${BRAND.name}, inicio`}>
      <LogoMark />
      <span className="text-lg tracking-tight">
        EcoMove <span className="font-normal text-ink-muted">Querétaro</span>
      </span>
    </Link>
  );
}
