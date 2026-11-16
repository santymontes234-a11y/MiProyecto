import { cn } from "@/lib/cn";
import { EmptyState, ErrorState, Skeleton } from "./StateViews";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  caption: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, caption, emptyTitle = "Sin resultados", emptyDescription }: DataTableProps<T>) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("border-b border-line px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted", c.align === "right" ? "text-right" : "text-left", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={loading || undefined}>
          {loading && !rows?.length
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className="border-b border-line px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr key={rowKey(row)} className={cn("hover:bg-subtle/60", loading && "opacity-60")}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn("border-b border-line px-3 py-3 align-middle text-ink", c.align === "right" && "text-right tabular-nums", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
