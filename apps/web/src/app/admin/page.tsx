"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { OverviewPanel } from "@/components/stats/OverviewPanel";
import { AnalyticsFilterBar, AnalyticsFiltersProvider } from "@/components/analytics/AnalyticsFilters";
import { CityTrendCard, InfrastructureCard, UsersGrowthCard } from "@/components/analytics/AnalyticsCharts";

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard general" description="Indicadores agregados de movilidad sostenible en Querétaro." />
      <OverviewPanel />
      <h2 className="mb-3 mt-10 text-lg font-semibold">Tendencias</h2>
      <AnalyticsFiltersProvider>
        <AnalyticsFilterBar />
        <div className="grid gap-6 xl:grid-cols-2">
          <CityTrendCard />
          <UsersGrowthCard />
        </div>
        <div className="mt-6"><InfrastructureCard /></div>
      </AnalyticsFiltersProvider>
    </>
  );
}
