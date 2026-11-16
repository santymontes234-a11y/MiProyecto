import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

/** Variantes de DESIGN_SYSTEM §3 (paridad con mobile). */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // primary sobre blanco ≈ 3.3:1 → etiqueta de 18 px en bold (regla de contraste del DS).
  primary: "bg-brand text-on-brand text-[18px] font-bold hover:bg-brand-strong shadow-sm",
  secondary: "border border-line bg-brand-soft text-brand-strong hover:bg-brand-soft/70",
  ghost: "text-ink-muted hover:bg-subtle hover:text-ink",
  danger: "bg-alert text-on-brand hover:bg-alert/90",
};
const sizes: Record<Size, string> = {
  // Área táctil ≥ 44×44 en todos los tamaños.
  sm: "min-h-11 min-w-11 px-3 gap-1.5",
  md: "min-h-11 px-4 gap-2",
  lg: "min-h-12 px-6 gap-2",
};
const textSizes: Record<Size, string> = { sm: "text-sm", md: "text-sm", lg: "text-base" };

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium leading-6 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    variant !== "primary" && textSizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", size = "md", className, children }: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}
