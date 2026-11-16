"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bike, Leaf, MapPinned, Timer } from "lucide-react";
import { formatCo2, formatDistance, formatDuration } from "@ecomove/shared";
import { api } from "@/lib/api";
import { daysAgoIso, formatNumber } from "@/lib/format";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { useSession } from "@/components/auth/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/StateViews";
import { ButtonLink } from "@/components/ui/Button";
import { QueryNotice } from "@/components/common/QueryNotice";
import { TrendChart } from "@/components/stats/TrendChart";
import { ModeShareChart } from "@/components/stats/ModeShareChart";
import { TripCard } from "@/components/trips/TripCard";

export default function UserDashboardPage() {
  const { user } = useSession();
  const last30 = useMemo(() => ({ from: daysAgoIso(30), to: new Date().toISOString() }), []);
  const total = useApiQuery("me|all", () => api.stats.me());
  const month = useApiQuery("me|30d", () => api.stats.me(last30));
  const recent = useApiQuery("trips|recent", () => api.trips.list({ page: 1, page_size: 5 }));
  const firstName = user.full_name.split(" ")[0] ?? user.full_name;
  const t = total.data;
  const v = (fn: () => string) => (total.loading || !t ? "—" : fn());

  return (
    <>
      <QueryNotice
        messages={{
          welcome: { tone: "success", text: "¡Bienvenida o bienvenido a EcoMove! Registra tu primer viaje desde la app Android." },
          forbidden: { tone: "warning", text: "No tienes permisos para acceder a esa sección." },
        }}
      />
      <PageHeader title={`Hola, ${firstName}`} description="Tu impacto en la movilidad sostenible de Querétaro." />
      {total.error && <div className="mb-6"><ErrorState message={errorMessage(total.error)} onRetry={total.refetch} /></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="CO₂ evitado total" value={v(() => formatCo2(t!.co2_saved_g))} hint={month.data ? `${formatCo2(month.data.co2_saved_g)} en los últimos 30 días` : undefined} icon={<Leaf className="size-5" />} />
        <StatTile label="Viajes" value={v(() => formatNumber(t!.trips_count))} hint={month.data ? `${formatNumber(month.data.trips_count)} en 30 días` : undefined} icon={<Bike className="size-5" />} accent="blue" />
        <StatTile label="Distancia" value={v(() => formatDistance(t!.distance_m))} icon={<MapPinned className="size-5" />} accent="teal" />
        <StatTile label="Tiempo en movimiento" value={v(() => formatDuration(t!.duration_s))} icon={<Timer className="size-5" />} accent="yellow" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <TrendChart title="Tu actividad" cacheKey="me-ts" load={(q) => api.stats.meTimeseries(q)} />
        <Card>
          <CardHeader title="Viajes recientes" actions={<Link href="/app/viajes" className="text-sm font-medium text-brand-strong underline">Ver todos</Link>} />
          {recent.loading ? (
            <LoadingBlock />
          ) : recent.error ? (
            <ErrorState message={errorMessage(recent.error)} onRetry={recent.refetch} />
          ) : !recent.data?.items.length ? (
            <EmptyState title="Aún no tienes viajes" description="Registra un trayecto a pie, en bici o en autobús desde la app Android." action={<ButtonLink href="/movilidad-sostenible" variant="secondary" size="sm">Ideas para empezar</ButtonLink>} />
          ) : (
            <ul className="-mx-3 divide-y divide-line">
              {recent.data.items.map((trip) => <li key={trip.id}><TripCard trip={trip} /></li>)}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <ModeShareChart title="Cómo te mueves" data={t?.by_mode} loading={total.loading} error={total.error ? errorMessage(total.error) : null} onRetry={total.refetch} />
      </div>
    </>
  );
}
