import type {
  AchievementCriterion,
  CitizenReportCategory,
  CitizenReportStatus,
  ReportType,
  TripSource,
  ZoneKind,
} from "@ecomove/shared";

/**
 * Etiquetas en español de enums de 1.1.0 que aún no están en @ecomove/shared
 * (pendiente de mover a packages/shared/src/constants/labels.ts, dueño: architect).
 */
export const CITIZEN_REPORT_CATEGORY_LABELS: Record<CitizenReportCategory, string> = {
  BIKE_LANE_DAMAGE: "Daño en ciclovía",
  MISSING_INFRASTRUCTURE: "Falta infraestructura",
  SAFETY: "Seguridad vial",
  POI_ISSUE: "Problema en estación o parada",
  OTHER: "Otro",
};

export const CITIZEN_REPORT_STATUS_LABELS: Record<CitizenReportStatus, string> = {
  OPEN: "Abierto",
  IN_REVIEW: "En revisión",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  overview: "Resumen general",
  trips: "Viajes (sin trazas)",
  users: "Usuarios (sin datos personales)",
  co2_by_mode: "CO₂ por medio",
  co2_by_zone: "CO₂ por zona",
  analytics_timeseries: "Serie temporal de la ciudad",
  citizen_reports: "Reportes ciudadanos",
  audit_logs: "Auditoría",
};

export const ZONE_KIND_LABELS: Record<ZoneKind, string> = {
  colonia: "Colonia",
  ageb: "AGEB",
  municipio: "Municipio",
  distrito: "Distrito",
  custom: "Personalizada",
};

export const ACHIEVEMENT_CRITERION_LABELS: Record<AchievementCriterion, string> = {
  TRIPS_COUNT: "Número de viajes",
  DISTANCE_M: "Distancia (m)",
  CO2_SAVED_G: "CO₂ evitado (g)",
  DISTINCT_MODES: "Medios distintos",
};

export const TRIP_SOURCE_LABELS: Record<TripSource, string> = {
  GPS: "GPS",
  PLANNED: "Planificado",
};

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
