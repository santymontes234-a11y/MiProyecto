"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Leaf, MapPinned, Timer, Trash2, Wind } from "lucide-react";
import { formatCo2, formatDistance, formatDuration, modeColors, MODE_LABELS } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/StateViews";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { MapView } from "@/components/map/MapView";

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();
  const { data: trip, error, loading, refetch } = useApiQuery(`trip|${tripId}`, () => api.trips.get(tripId));
  const [confirm, setConfirm] = useState(false);
  const del = useMutation(() => api.trips.remove(tripId));

  if (loading) return <LoadingBlock label="Cargando viaje…" />;
  if (error?.status === 404) {
    return <EmptyState title="Viaje no encontrado" description="Puede que se haya eliminado." action={<ButtonLink href="/app/viajes" variant="secondary">Volver al historial</ButtonLink>} />;
  }
  if (error || !trip) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <Link href="/app/viajes" className="no-print mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-strong">
        <ArrowLeft className="size-4" aria-hidden="true" /> Historial
      </Link>
      <PageHeader
        title={`Viaje en ${MODE_LABELS[trip.mode].toLowerCase()}`}
        description={`${formatDateTime(trip.started_at)} → ${formatDateTime(trip.ended_at)}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>PDF</Button>
            <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
              <Trash2 className="size-4" aria-hidden="true" /> Eliminar
            </Button>
          </>
        }
      />
      <div className="mb-6"><ModeBadge mode={trip.mode} /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="CO₂ evitado" value={formatCo2(trip.co2_saved_g)} icon={<Leaf className="size-5" />} />
        <StatTile label="CO₂ emitido" value={formatCo2(trip.co2_emitted_g)} hint={`Factor aplicado: ${trip.emission_factor_g_per_km} g/km`} icon={<Wind className="size-5" />} accent="yellow" />
        <StatTile label="Distancia" value={formatDistance(trip.distance_m)} icon={<MapPinned className="size-5" />} accent="blue" />
        <StatTile label="Duración" value={formatDuration(trip.duration_s)} icon={<Timer className="size-5" />} accent="teal" />
      </div>
      <Card className="mt-6">
        <CardHeader title="Recorrido" description="Solo tú puedes ver la traza de tus viajes." />
        <MapView label="Recorrido del viaje" route={trip.route.coordinates} routeColor={modeColors[trip.mode]} height={420} />
      </Card>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="¿Eliminar este viaje?">
        <p className="text-sm text-ink-muted">Se quitará de tu historial y de tus estadísticas. Esta acción no se puede deshacer.</p>
        {del.error && <p role="alert" className="mt-3 text-sm text-alert">{del.error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
          <Button
            variant="danger"
            loading={del.pending}
            onClick={async () => {
              const res = await del.run();
              if (res.ok) {
                setConfirm(false);
                router.replace("/app/viajes");
              }
            }}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </>
  );
}
