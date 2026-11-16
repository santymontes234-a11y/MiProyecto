import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { InfrastructureMap } from "@/components/map/InfrastructureMap";
import { PendingCard } from "@/components/common/PendingCard";

export const metadata: Metadata = { title: "Mapa de calor" };

export default function AdminMapPage() {
  return (
    <>
      <PageHeader title="Mapas" description="Infraestructura actual y concentración de viajes." />
      <div className="space-y-6">
        <PendingCard title="Mapa de calor de viajes" description="Celdas con k-anonimato; sin trazas individuales" feature="Mapa de calor" />
        <Card>
          <CardHeader title="Infraestructura" description="Ciclovías y puntos de servicio en el área visible." />
          <InfrastructureMap />
        </Card>
      </div>
    </>
  );
}
