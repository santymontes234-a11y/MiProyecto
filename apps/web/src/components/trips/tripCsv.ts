import { MODE_LABELS, type TripSummary } from "@ecomove/shared";
import type { Cell } from "@/lib/export";

/** Columnas del CSV de historial. Unidades del contrato (m, s, g) para no perder precisión. */
export const TRIP_CSV_HEADERS = ["id", "fecha_inicio", "fecha_fin", "medio", "estado", "distancia_m", "duracion_s", "co2_emitido_g", "co2_evitado_g", "puntos", "origen"];

export function tripToCsvRow(t: TripSummary): Cell[] {
  return [t.id, t.started_at, t.ended_at, MODE_LABELS[t.mode], t.status, t.distance_m, t.duration_s, t.co2_emitted_g, t.co2_saved_g, t.points, t.source];
}
