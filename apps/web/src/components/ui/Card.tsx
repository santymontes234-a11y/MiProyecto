import { cn } from "@/lib/cn";

export function Card({ className, children, as: Tag = "section", ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Tag className={cn("rounded-lg border border-line bg-panel p-5 shadow-card", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, actions, id }: { title: string; description?: string; actions?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={id} className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
