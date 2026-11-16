import { Card, CardHeader } from "@/components/ui/Card";
import { PendingContract, PROPOSALS } from "./PendingContract";

/** Tarjeta para una visualización cuyo endpoint está en la propuesta de analítica. */
export function PendingCard({ title, description, feature }: { title: string; description?: string; feature?: string }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <PendingContract feature={feature ?? title} proposal={PROPOSALS.analytics} />
    </Card>
  );
}
