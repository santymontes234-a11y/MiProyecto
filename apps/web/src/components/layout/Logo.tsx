import Link from "next/link";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" style={{ fill: "var(--color-primary)" }} />
      <path d="M9 21c0-6.5 5-11 14-11-1 8.5-5.5 13-11.5 13-.9 0-1.7-.1-2.5-.4" fill="none" style={{ stroke: "var(--color-on-primary)" }} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 23.5c2.5-4 5.5-6.5 9-8" fill="none" style={{ stroke: "var(--color-primary-soft)" }} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold text-brand-strong" aria-label="EcoMove Querétaro, inicio">
      <LogoMark />
      <span className="text-lg tracking-tight">
        EcoMove <span className="font-normal text-ink-muted">Querétaro</span>
      </span>
    </Link>
  );
}
