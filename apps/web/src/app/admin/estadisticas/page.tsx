import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { OverviewPanel } from "@/components/stats/OverviewPanel";
import { PendingCard } from "@/components/common/PendingCard";

export const metadata: Metadata = { title: "Estadísticas" };

export default function AdminStatsPage() {
  return (
    <>
      <PageHeader title="Estadísticas" description="Análisis agregado y anónimo. Nunca se muestran trazas individuales." />
      <OverviewPanel />
      <h2 className="mb-3 mt-10 text-lg font-semibold">Análisis avanzado</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <PendingCard title="Viajes y CO₂ por día, semana y mes" />
        <PendingCard title="Horarios pico" description="Viajes por hora del día y día de la semana" />
        <PendingCard title="Distribución por zona" />
        <PendingCard title="Rutas frecuentes" description="Flujos origen–destino entre zonas" />
        <PendingCard title="Evolución de usuarios" />
      </div>
    </>
  );
}
