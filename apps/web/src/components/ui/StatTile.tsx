import { cn } from "@/lib/cn";

const accents = {
  green: "bg-brand-soft text-brand-strong",
  teal: "bg-aqua/15 text-ink",
  blue: "bg-info/15 text-ink",
  yellow: "bg-warn text-on-warn",
} as const;

/** StatTile (DESIGN_SYSTEM §3): cifra protagonista con etiqueta, unidad y pista opcionales. */
export function StatTile({ label, value, unit, hint, icon, accent = "green", className }: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: keyof typeof accents;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-panel p-5 shadow-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {icon && <span className={cn("rounded-md p-2", accents[accent])} aria-hidden="true">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-ink-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
