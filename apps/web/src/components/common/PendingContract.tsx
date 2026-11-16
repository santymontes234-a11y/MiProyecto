import { FileClock } from "lucide-react";
import { EmptyState } from "@/components/ui/StateViews";

/**
 * Sección cuyo endpoint aún no existe en API_CONTRACT 1.0.0. No se muestran datos simulados
 * (AGENTS §5): se indica la propuesta que la habilita.
 */
export function PendingContract({ feature, proposal }: { feature: string; proposal: string }) {
  return (
    <EmptyState
      icon={<FileClock className="size-6" />}
      title={`${feature}: pendiente de contrato`}
      description={`Esta sección se activará cuando la API publique los endpoints descritos en docs/proposals/${proposal}.`}
    />
  );
}

export const PROPOSALS = {
  analytics: "2026-11-15-web-admin-analytics.md",
  gamification: "2026-11-15-mobile-gamification.md",
} as const;
