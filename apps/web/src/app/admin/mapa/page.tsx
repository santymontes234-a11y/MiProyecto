import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { InfrastructureMap } from "@/components/map/InfrastructureMap";
import { AnalyticsMap } from "@/features/analytics-map";

export const metadata: Metadata = { title: "Mapa analítico" };

export default function AdminMapPage() {
  return (
    <>
      <PageHeader title="Mapas" description="Infraestructura actual y concentración de viajes." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Mapa analítico" description="Calor de viajes, cobertura de ciclovías y prioridad de infraestructura por celda de malla (no por zona INEGI). Celdas agregadas con mínimo de personas; nunca trazas individuales." />
          <AnalyticsMap />
        </Card>
        <Card>
          <CardHeader title="Infraestructura" description="Ciclovías y puntos de servicio en el área visible." />
          <InfrastructureMap />
        </Card>
      </div>
    </>
  );
}
