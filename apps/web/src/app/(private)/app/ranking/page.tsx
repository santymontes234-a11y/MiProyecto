import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PendingContract, PROPOSALS } from "@/components/common/PendingContract";

export const metadata: Metadata = { title: "Ranking" };

export default function RankingPage() {
  return (
    <>
      <PageHeader title="Ranking" description="Clasificación de la comunidad por CO₂ evitado (solo participantes que lo autoricen)." />
      <Card>
        <PendingContract feature="Ranking" proposal={PROPOSALS.gamification} />
      </Card>
    </>
  );
}
