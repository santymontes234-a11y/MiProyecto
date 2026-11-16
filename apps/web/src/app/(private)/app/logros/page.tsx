import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PendingContract, PROPOSALS } from "@/components/common/PendingContract";

export const metadata: Metadata = { title: "Logros" };

export default function AchievementsPage() {
  return (
    <>
      <PageHeader title="Logros" description="Insignias por tus hábitos de movilidad sostenible." />
      <Card>
        <PendingContract feature="Logros" proposal={PROPOSALS.gamification} />
      </Card>
    </>
  );
}
