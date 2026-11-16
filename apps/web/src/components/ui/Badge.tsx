import { cn } from "@/lib/cn";

export type Tone = "green" | "teal" | "blue" | "yellow" | "red" | "gray";

const tones: Record<Tone, string> = {
  green: "bg-brand-soft text-brand-strong",
  teal: "bg-aqua/15 text-ink",
  blue: "bg-info/10 text-ink",
  yellow: "bg-warn/20 text-ink",
  red: "bg-alert/10 text-alert",
  gray: "bg-subtle text-ink",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}
