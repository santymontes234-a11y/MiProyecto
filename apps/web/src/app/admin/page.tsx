import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { OverviewPanel } from "@/components/stats/OverviewPanel";
import { InfrastructureIndicators } from "@/components/stats/InfrastructureIndicators";
import { PendingCard } from "@/components/common/PendingCard";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard general" description="Indicadores agregados de movilidad sostenible en Querétaro." />
      <OverviewPanel />
      <Card className="mt-6">
        <CardHeader title="Indicadores de infraestructura" description="Ciclovías y puntos de servicio registrados." />
        <InfrastructureIndicators />
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PendingCard title="Viajes por día, semana y mes" description="Serie temporal de toda la ciudad" />
        <PendingCard title="Evolución de usuarios" description="Altas y usuarios acumulados" />
      </div>
    </>
  );
}
