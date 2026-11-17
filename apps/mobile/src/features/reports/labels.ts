import type { CitizenReportCategory, CitizenReportStatus } from '@ecomove/shared';

/** Etiquetas de UI (las etiquetas son responsabilidad de los clientes, contrato §8). */
export const CITIZEN_REPORT_LABELS: Record<CitizenReportCategory, string> = {
  BIKE_LANE_DAMAGE: 'Ciclovía dañada',
  MISSING_INFRASTRUCTURE: 'Falta infraestructura',
  SAFETY: 'Seguridad vial',
  POI_ISSUE: 'Problema en estación/parada',
  OTHER: 'Otro',
};

export const CITIZEN_REPORT_STATUS_LABELS: Record<CitizenReportStatus, string> = {
  OPEN: 'Abierto',
  IN_REVIEW: 'En revisión',
  RESOLVED: 'Resuelto',
  REJECTED: 'Rechazado',
};
