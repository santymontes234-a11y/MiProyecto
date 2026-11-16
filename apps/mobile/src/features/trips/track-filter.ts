import type { Position } from '@ecomove/shared';

import { haversineM } from '@/lib/geo';

/** Fix GPS normalizado (independiente de expo-location para poder probarlo). */
export interface GpsFix {
  coord: Position;
  timestamp: number;
  accuracy: number | null;
  mocked?: boolean;
}

export const TRACK_FILTER = {
  /** Se descartan fixes con precisión peor que esto (m). */
  maxAccuracyM: 50,
  /** Distancia mínima entre puntos guardados (m), para reducir ruido estático. */
  minStepM: 5,
  /** Velocidad imposible para estos modos (m/s ≈ 144 km/h): salto GPS. */
  maxSpeedMps: 40,
} as const;

export type FixDecision = 'accept' | 'inaccurate' | 'too_close' | 'jump';

/**
 * Decide si un fix nuevo se añade a la traza. Solo limpia ruido: la distancia y el CO₂
 * oficiales los calcula el backend a partir de la traza enviada.
 */
export function evaluateFix(prev: GpsFix | null, next: GpsFix): FixDecision {
  if (next.accuracy !== null && next.accuracy > TRACK_FILTER.maxAccuracyM) return 'inaccurate';
  if (!prev) return 'accept';
  const d = haversineM(prev.coord, next.coord);
  if (d < TRACK_FILTER.minStepM) return 'too_close';
  const dt = (next.timestamp - prev.timestamp) / 1000;
  if (dt > 0 && d / dt > TRACK_FILTER.maxSpeedMps) return 'jump';
  return 'accept';
}
