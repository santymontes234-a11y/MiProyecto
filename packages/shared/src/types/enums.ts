/** Enums del contrato v1.1.0 (docs/API_CONTRACT.md §0). Mantener sincronizado con apps/api/app/models/enums.py */

export const ROLES = ['USER', 'ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const TRANSPORT_MODES = [
  'WALK',
  'BICYCLE',
  'E_SCOOTER',
  'BUS',
  'CARPOOL',
  'MOTORCYCLE',
  'CAR',
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const TRIP_STATUSES = ['COMPLETED', 'CANCELLED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const POI_CATEGORIES = [
  'BIKE_PARKING',
  'BIKE_SHARING',
  'BUS_STOP',
  'EV_CHARGER',
  'REPAIR_STATION',
] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

export const GRANULARITIES = ['day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const TRIP_SOURCES = ['GPS', 'PLANNED'] as const;
export type TripSource = (typeof TRIP_SOURCES)[number];

export const ZONE_KINDS = ['colonia', 'ageb', 'municipio', 'distrito', 'custom'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const ACHIEVEMENT_CRITERIA = ['TRIPS_COUNT', 'DISTANCE_M', 'CO2_SAVED_G', 'DISTINCT_MODES'] as const;
export type AchievementCriterion = (typeof ACHIEVEMENT_CRITERIA)[number];

export const NOTIFICATION_TYPES = ['ACHIEVEMENT_UNLOCKED', 'WEEKLY_SUMMARY', 'SYSTEM'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CITIZEN_REPORT_CATEGORIES = [
  'BIKE_LANE_DAMAGE',
  'MISSING_INFRASTRUCTURE',
  'SAFETY',
  'POI_ISSUE',
  'OTHER',
] as const;
export type CitizenReportCategory = (typeof CITIZEN_REPORT_CATEGORIES)[number];

export const CITIZEN_REPORT_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const;
export type CitizenReportStatus = (typeof CITIZEN_REPORT_STATUSES)[number];

export const REPORT_TYPES = [
  'overview',
  'trips',
  'users',
  'co2_by_mode',
  'co2_by_zone',
  'analytics_timeseries',
  'citizen_reports',
  'audit_logs',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ['csv', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const ANALYTICS_DATASETS = ['official', 'demo'] as const;
export type AnalyticsDataset = (typeof ANALYTICS_DATASETS)[number];

/** 1.2 — tipo de vehículo para CAR y CARPOOL (contrato §4.3). */
export const VEHICLE_TYPES = ['COMPACT', 'SEDAN', 'SUV', 'PICKUP', 'MINIVAN', 'HYBRID', 'ELECTRIC'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const RANKING_PERIODS = ['week', 'month', 'all'] as const;
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

const ROLE_LEVEL: Record<Role, number> = { USER: 1, ADMIN: 2, SUPER_ADMIN: 3 };

/**
 * Solo para mostrar u ocultar UI. La autorización real la hace la API (SECURITY.md §2).
 */
export function hasRoleAtLeast(role: Role, required: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[required];
}
