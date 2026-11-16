import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-subtle", className)} />;
}

export function LoadingBlock({ label = "Cargando…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-3 rounded-full bg-brand-soft p-3 text-brand-strong" aria-hidden="true">{icon ?? <Inbox className="size-6" />}</div>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-md border border-alert/40 bg-alert/10 px-6 py-8 text-center">
      <AlertTriangle className="mb-2 size-6 text-alert" aria-hidden="true" />
      <p className="text-sm text-alert">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" /> Reintentar
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "success" | "error" | "warning"; children: React.ReactNode }) {
  const styles = {
    info: "border-info/30 bg-info/10 text-ink",
    success: "border-brand/30 bg-subtle text-brand-strong",
    error: "border-alert/40 bg-alert/10 text-alert",
    warning: "border-warn/50 bg-warn/20 text-ink",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", styles)}>
      {children}
    </div>
  );
}
