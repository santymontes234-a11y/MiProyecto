import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCo2, formatDistance, formatDuration, type TripSummary } from "@ecomove/shared";
import { formatDateTime } from "@/lib/format";
import { ModeBadge } from "@/components/ui/ModeBadge";

/** TripCard (DESIGN_SYSTEM §3): resumen de un viaje con formateadores de shared. */
export function TripCard({ trip }: { trip: TripSummary }) {
  return (
    <Link href={`/app/viajes/${encodeURIComponent(trip.id)}`} className="flex min-h-11 items-center gap-4 rounded-md px-3 py-3 hover:bg-subtle">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={trip.mode} />
          <span className="text-xs text-ink-muted">{formatDateTime(trip.started_at)}</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {formatDistance(trip.distance_m)} · {formatDuration(trip.duration_s)}
        </p>
      </div>
      <p className="text-right text-sm font-semibold text-brand-strong">
        {formatCo2(trip.co2_saved_g)}
        <span className="block text-xs font-normal text-ink-muted">evitados</span>
      </p>
      <ChevronRight className="size-4 text-ink-muted" aria-hidden="true" />
    </Link>
  );
}
