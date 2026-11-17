/**
 * Tipos añadidos en el contrato v1.1.0 (docs/API_CONTRACT.md, secciones marcadas 🆕).
 * Espejo de apps/api/app/schemas/*.py. Propiedades en snake_case tal como viajan en JSON.
 */
import type {
  AchievementCriterion,
  AnalyticsDataset,
  CitizenReportCategory,
  CitizenReportStatus,
  Granularity,
  NotificationType,
  PoiCategory,
  RankingPeriod,
  ReportFormat,
  ReportType,
  TransportMode,
  TripSource,
  TripStatus,
  VehicleType,
  ZoneKind,
} from './enums';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineStringGeometry,
  MultiPolygonGeometry,
  PointGeometry,
  PolygonGeometry,
  Position,
} from './geojson';
import type {
  DateRangeQuery,
  ISODateTime,
  Paginated,
  PaginationQuery,
  StatsSummary,
  Trip,
  TripEstimate,
  TripSummary,
  User,
  UUID,
} from './api';

// ---------- §2 Auth ----------
export interface Session {
  id: UUID;
  created_at: ISODateTime;
  last_used_at: ISODateTime;
  expires_at: ISODateTime;
  user_agent: string | null;
  current: boolean;
}

export interface EmailRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  new_password: string;
}

export interface EmailVerificationConfirm {
  token: string;
}

export interface MessageResponse {
  message: string;
}

// ---------- §3 Users ----------
export interface Preferences {
  language: 'es' | 'en';
  default_mode: TransportMode | null;
  weekly_goal_trips: number | null;
  email_notifications: boolean;
  /** 1.2 */
  default_vehicle_type: VehicleType | null;
}

export interface AccountDeleteRequest {
  password: string;
}

export interface UserExport {
  exported_at: ISODateTime;
  user: User;
  preferences: Preferences;
  trips: Trip[];
  achievements: UserAchievement[];
  stats: StatsSummary;
  notifications: Notification[];
  citizen_reports: CitizenReport[];
}

// ---------- §4 Trips ----------
export interface TripEstimateBatchRequest {
  modes: TransportMode[];
  route?: LineStringGeometry | null;
  distance_m?: number | null;
  /** 1.2 — solo CAR y CARPOOL (§4.3) */
  vehicle_type?: VehicleType | null;
  /** 1.2 — 1..8, solo CAR y CARPOOL (§4.3) */
  occupants?: number | null;
}

export interface TripEstimateBatchResponse {
  items: TripEstimate[];
}

export interface TripUpdate {
  mode?: TransportMode;
  status?: TripStatus;
  started_at?: ISODateTime;
  ended_at?: ISODateTime;
  route?: LineStringGeometry;
  source?: TripSource;
  route_token?: string;
  /** 1.2 — solo CAR y CARPOOL (§4.3) */
  vehicle_type?: VehicleType | null;
  /** 1.2 — 1..8, solo CAR y CARPOOL (§4.3) */
  occupants?: number | null;
}

export interface RecurringTripCreate {
  mode: TransportMode;
  route: LineStringGeometry;
  /** Fecha sin hora, AAAA-MM-DD */
  start_date: string;
  /** Fecha sin hora, AAAA-MM-DD; ≤ hoy */
  end_date: string;
  /** 0 = lunes … 6 = domingo */
  weekdays: number[];
  /** HH:MM */
  departure_time: string;
  duration_s: number;
  utc_offset_minutes: number;
}

export interface RecurringTripResult {
  recurrence_id: UUID;
  created: number;
  skipped_duplicates: number;
  trip_ids: UUID[];
}

// ---------- §7 Admin ----------
export interface ReasonRequest {
  /** 5..500 caracteres */
  reason: string;
}

export interface AdminTripSummary extends TripSummary {
  user_id: UUID;
}

export interface AdminTripQuery extends PaginationQuery, DateRangeQuery {
  user_id?: UUID;
  mode?: TransportMode;
  status?: TripStatus;
  source?: TripSource;
}

export interface ZoneProperties {
  code: string;
  name: string;
  kind: ZoneKind;
  source: string;
  area_km2: number;
}
export type ZoneFeature = Feature<MultiPolygonGeometry, ZoneProperties>;
export type ZoneCollection = FeatureCollection<MultiPolygonGeometry, ZoneProperties>;

export interface ZoneCreate {
  code: string;
  name: string;
  kind: ZoneKind;
  source: string;
  geometry: PolygonGeometry | MultiPolygonGeometry;
}

export type ZoneUpdate = Partial<Omit<ZoneCreate, 'code'>>;

export interface TransportModeInfo {
  mode: TransportMode;
  max_speed_kmh: number;
  is_active: boolean;
}

/** 1.2 — §8, sin factor de emisión (ADR-002) */
export interface VehicleTypeInfo {
  code: VehicleType;
  max_occupants: number;
  is_active: boolean;
}

/** 1.2 — §12.1 */
export interface GeocodeQuery {
  q: string;
  limit?: number;
  near?: Position;
}

export interface Place {
  name: string;
  label: string;
  position: Position;
  category: string | null;
  /** 1.2.1: 'zone' = municipio o zona */
  source: 'zone' | 'poi' | 'osm';
}

export interface GeocodeResponse {
  items: Place[];
}

export interface TransportModeUpdate {
  max_speed_kmh?: number;
  is_active?: boolean;
}

export interface AchievementCreate {
  code: string;
  name: string;
  description: string;
  icon: string;
  criterion: AchievementCriterion;
  threshold: number;
  bonus_points: number;
  is_active?: boolean;
}

export type AchievementUpdate = Partial<Omit<AchievementCreate, 'code'>>;

export interface ReportCreate {
  report_type: ReportType;
  format?: ReportFormat;
  from?: ISODateTime | null;
  to?: ISODateTime | null;
}

export interface Report {
  id: UUID;
  report_type: ReportType;
  format: ReportFormat;
  parameters: { from: ISODateTime | null; to: ISODateTime | null };
  row_count: number;
  created_by: UUID | null;
  created_at: ISODateTime;
}

// ---------- §8 Catálogos ----------
export interface CatalogZoneQuery {
  bbox?: [number, number, number, number];
  kind?: ZoneKind;
}

// ---------- §9 Gamificación ----------
export interface Achievement {
  id: UUID;
  code: string;
  name: string;
  description: string;
  icon: string;
  criterion: AchievementCriterion;
  threshold: number;
  bonus_points: number;
  is_active: boolean;
}

export interface UserAchievement {
  achievement: Achievement;
  awarded_at: ISODateTime | null;
  progress: number;
}

export interface GamificationProfile {
  points_total: number;
  level: number;
  level_points: number;
  next_level_points: number | null;
}

export interface RankingEntry {
  position: number;
  display_name: string;
  points: number;
  is_me: boolean;
}

export interface Ranking {
  period: RankingPeriod;
  period_start: ISODateTime | null;
  entries: RankingEntry[];
  me: { position: number; points: number } | null;
}

// ---------- §10 Notificaciones ----------
export interface Notification {
  id: UUID;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface NotificationPage extends Paginated<Notification> {
  unread_count: number;
}

export interface NotificationQuery extends PaginationQuery {
  unread_only?: boolean;
}

// ---------- §11 Reportes ciudadanos ----------
export interface CitizenReportCreate {
  category: CitizenReportCategory;
  title: string;
  description: string;
  location: PointGeometry;
  poi_id?: UUID | null;
}

export interface CitizenReport {
  id: UUID;
  category: CitizenReportCategory;
  status: CitizenReportStatus;
  title: string;
  description: string;
  location: PointGeometry;
  poi_id: UUID | null;
  reporter_id: UUID | null;
  resolution_note: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AdminCitizenReportQuery extends PaginationQuery, DateRangeQuery {
  status?: CitizenReportStatus;
  category?: CitizenReportCategory;
  bbox?: [number, number, number, number];
}

export interface CitizenReportUpdate {
  status: CitizenReportStatus;
  resolution_note?: string;
}

// ---------- §12 Ruteo ----------
export interface RouteQuery {
  origin: Position;
  destination: Position;
  mode: TransportMode;
}

export interface RouteResponse {
  mode: TransportMode;
  distance_m: number;
  duration_s: number;
  route: LineStringGeometry;
  route_token: string;
  provider: string;
}

// ---------- §13 Analítica ----------
export interface AnalyticsMeta {
  from: ISODateTime;
  to: ISODateTime;
  modes: TransportMode[] | null;
  dataset: AnalyticsDataset;
  is_demo: boolean;
  min_users: number;
  is_estimate: boolean;
  bbox: [number, number, number, number] | null;
  notes: string[];
}

export interface AnalyticsQuery extends DateRangeQuery {
  mode?: TransportMode[];
  dataset?: AnalyticsDataset;
}

export interface AnalyticsBBoxQuery extends AnalyticsQuery {
  bbox: [number, number, number, number];
  cell_m?: number;
}

export interface Co2Sensitivity {
  baseline_occupancy: number;
  avoided_g: number;
}

export interface ModeCo2Breakdown {
  mode: TransportMode;
  trips_count: number;
  users: number;
  share_of_trips: number;
  passenger_km: number;
  reference_car_g: number;
  mode_g: number;
  avoided_g: number;
  per_passenger_km_g: number | null;
  vehicle_g_estimate: number | null;
  vehicle_occupancy_assumed: number | null;
  clamped_trips: number;
  sensitivity: Co2Sensitivity[];
}

export interface AnalyticsSummary {
  trips_count: number;
  active_users: number;
  distance_m: number;
  sustainable_trips: number;
  sustainable_distance_m: number;
  co2_emitted_g: number;
  co2_saved_g: number;
  co2: {
    trips_count: number;
    passenger_km: number;
    reference_car_g: number;
    mode_g: number;
    avoided_g: number;
    clamped_trips: number;
  } | null;
  by_mode: ModeCo2Breakdown[];
  suppressed: boolean;
  meta: AnalyticsMeta;
}

export interface AnalyticsItems<T> {
  items: T[];
  meta: AnalyticsMeta;
}

export interface PeakHour {
  hour: number;
  weekday: number | null;
  trips_count: number;
  co2_saved_g: number;
}

export interface PeakHoursResponse extends AnalyticsItems<PeakHour> {
  suppressed: boolean;
  timezone: string;
}

export interface AnalyticsTimePoint {
  period_start: ISODateTime;
  trips_count: number;
  distance_m: number;
  co2_saved_g: number;
  active_users: number;
}

export interface AnalyticsTimeSeries {
  granularity: Granularity;
  timezone: string;
  points: AnalyticsTimePoint[];
  suppressed: boolean;
  meta: AnalyticsMeta;
}

export interface UsersGrowthPoint {
  period_start: ISODateTime;
  new_users: number;
  total_users: number;
  active_users: number;
}

export interface UsersGrowth {
  granularity: Granularity;
  timezone: string;
  points: UsersGrowthPoint[];
  meta: AnalyticsMeta;
}

export interface InfrastructureSummary {
  pois_by_category: Record<PoiCategory, number>;
  pois_inactive: number;
  cycleways_length_m: number;
  cycleways_protected_length_m: number;
  meta: AnalyticsMeta;
}

export interface Co2Methodology {
  assumptions: Record<string, unknown>;
  units: Record<string, string>;
  notes: string[];
  meta: AnalyticsMeta;
}

export interface AnalyticsFeatureCollection<P, G extends Geometry = Geometry> {
  type: 'FeatureCollection';
  features: { type: 'Feature'; id: string | null; geometry: G; properties: P }[];
  meta: AnalyticsMeta;
}

export interface ZoneStats {
  zone_id: UUID;
  zone_code: string;
  zone_name: string;
  zone_is_demo: boolean;
  area_km2: number;
  origins: number;
  destinations: number;
  internal_trips: number;
  users: number;
  sustainable_distance_m: number;
  co2_saved_g: number;
  trip_ends_per_km2: number;
}

export type ZoneTripRelation = 'origin' | 'destination' | 'both' | 'any';

export interface ZoneTrip {
  trip_id: UUID;
  mode: TransportMode;
  source: TripSource;
  started_at: ISODateTime;
  distance_m: number;
  co2_saved_g: number;
  relation: Exclude<ZoneTripRelation, 'any'>;
}

export interface ZoneTripPage extends Paginated<ZoneTrip> {
  meta: AnalyticsMeta;
}

export interface OdFlow {
  origin_zone_id: UUID;
  origin_zone_name: string;
  destination_zone_id: UUID;
  destination_zone_name: string;
  trips_count: number;
  users: number;
  avg_distance_m: number;
}

export interface GridCell {
  cell_i: number;
  cell_j: number;
  trips_count: number;
  users: number;
  co2_saved_g: number;
}

export interface HeatmapResponse
  extends AnalyticsFeatureCollection<{ weight: number; users: number }, PointGeometry> {
  cell_m: number;
  max_weight: number;
}

export interface Corridor {
  corridor_id: number;
  cells: number;
  trips_count: number;
  users: number;
  max_cell_trips: number;
  span_m: number;
  elongation: number;
  modes: Partial<Record<TransportMode, number>>;
}

export interface BikeLaneCoverageItem {
  mode: TransportMode;
  trips_count: number;
  covered_share: number;
}

export interface BikeLaneCoverage extends AnalyticsItems<BikeLaneCoverageItem> {
  buffer_m: number;
}

export interface RouteCrossingRequest {
  geometry: Geometry;
  buffer_m: number;
}

export interface RouteCrossing {
  trip_id: UUID;
  mode: TransportMode;
  started_at: ISODateTime;
  overlap_m: number;
}

export interface RouteCrossingPage extends Paginated<RouteCrossing> {
  meta: AnalyticsMeta;
}

export interface RouteOverlap {
  trip_a: UUID;
  trip_b: UUID;
  tolerance_m: number;
  shared_m: number;
  share_a: number;
  share_b: number;
  meta: AnalyticsMeta;
}

export interface DistanceResponse {
  distance_m: number;
  method: 'geodesic';
  meta: AnalyticsMeta;
}

export type PriorityInfra = 'bike_lane' | 'bike_station' | 'bus_stop' | 'pedestrian';

export type PriorityLabel =
  | 'candidata_prioritaria_para_estudio'
  | 'candidata_para_evaluar'
  | 'sin_senal_prioritaria'
  | 'datos_insuficientes';

export interface PriorityComponent {
  key: string;
  label: string;
  kind: string;
  raw: number | null;
  normalized: number | null;
  weight: number;
  contribution: number | null;
  available: boolean;
}

export interface PriorityCell {
  score: number | null;
  label: PriorityLabel;
  confidence: number;
  sample: { users: number; trip_ends: number };
  demand_share: number;
  components: PriorityComponent[];
  explanation: string;
}

export interface PriorityResponse extends AnalyticsFeatureCollection<PriorityCell, PolygonGeometry> {
  infra: PriorityInfra;
  profile_label: string;
  config_version: string;
  components: { key: string; label: string; kind: string; weight: number }[];
  notes: string[];
}
