"use client";

import { cn } from "@/lib/cn";

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-subtle p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-panel text-brand-strong shadow-sm" : "text-ink-muted hover:text-ink")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
