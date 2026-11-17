"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { AnalyticsFilterBar, AnalyticsFiltersProvider } from "@/components/analytics/AnalyticsFilters";
import { CityTrendCard, FrequentRoutesCard, InfrastructureCard, ModesCard, PeakHoursCard, UsersGrowthCard, ZonesCard } from "@/components/analytics/AnalyticsCharts";

export default function AdminStatsPage() {
  return (
    <AnalyticsFiltersProvider>
      <PageHeader title="Estadísticas" description="Análisis agregado y anónimo. Nunca se muestran trazas individuales." actions={<ExportButtons />} />
      <AnalyticsFilterBar />
      <div className="space-y-6">
        <CityTrendCard />
        <div className="grid gap-6 xl:grid-cols-2">
          <ModesCard />
          <PeakHoursCard />
          <ZonesCard />
          <FrequentRoutesCard />
        </div>
        <UsersGrowthCard />
        <InfrastructureCard />
      </div>
    </AnalyticsFiltersProvider>
  );
}
