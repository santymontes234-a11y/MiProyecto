"use client";

import { Segmented } from "@/components/ui/Segmented";
import { daysAgoIso } from "@/lib/format";

export type RangeKey = "30d" | "90d" | "365d" | "all";

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "365d", label: "12 meses" },
  { value: "all", label: "Todo" },
];

/** from/to del contrato (ISO 8601) para un rango relativo. */
export function rangeQuery(key: RangeKey, now = new Date()): { from?: string; to?: string } {
  if (key === "all") return {};
  const days = Number.parseInt(key, 10);
  return { from: daysAgoIso(days, now), to: now.toISOString() };
}

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return <Segmented label="Periodo" value={value} onChange={onChange} options={RANGE_OPTIONS} />;
}
