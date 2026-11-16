"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/StateViews";

function Notice({ messages }: { messages: Record<string, { tone: "info" | "success" | "warning" | "error"; text: string }> }) {
  const sp = useSearchParams();
  const hit = Object.entries(messages).find(([k]) => sp.has(k));
  if (!hit) return null;
  return <div className="mb-6"><Alert tone={hit[1].tone}>{hit[1].text}</Alert></div>;
}

/** Muestra un aviso según un parámetro de la URL (?welcome=1, ?forbidden=1…). */
export function QueryNotice(props: { messages: Record<string, { tone: "info" | "success" | "warning" | "error"; text: string }> }) {
  return (
    <Suspense fallback={null}>
      <Notice {...props} />
    </Suspense>
  );
}
