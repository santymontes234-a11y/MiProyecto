import { Bike, Bus, Car, Footprints, Users, Zap, type LucideIcon } from "lucide-react";
import { MODE_LABELS, modeColors, type TransportMode } from "@ecomove/shared";

const ICONS: Record<TransportMode, LucideIcon> = {
  WALK: Footprints,
  BICYCLE: Bike,
  E_SCOOTER: Zap,
  BUS: Bus,
  CARPOOL: Users,
  MOTORCYCLE: Car,
  CAR: Car,
};

/** Icono + color de modeColors + nombre (DESIGN_SYSTEM §3): nunca solo color. */
export function ModeBadge({ mode }: { mode: TransportMode }) {
  const Icon = ICONS[mode];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-ink">
      <span className="grid size-4 place-items-center rounded-full" style={{ background: modeColors[mode] }} aria-hidden="true">
        <Icon className="size-2.5 text-on-brand" />
      </span>
      {MODE_LABELS[mode]}
    </span>
  );
}
