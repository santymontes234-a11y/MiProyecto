/**
 * Tipos del contrato v1.1.0 (docs/API_CONTRACT.md). Lo nuevo de 1.1 está en api-v1-1.ts.
 * Espejo de apps/api/app/schemas/*.py — cualquier cambio requiere propuesta (AGENTS.md §4).
 * Las propiedades conservan snake_case tal como viajan en JSON.
 */
import type { Granularity, PoiCategory, Role, TransportMode, TripSource, TripStatus } from './enums';
import type { Feature, FeatureCollection, LineStringGeometry, PointGeometry } from './geojson';

export type ISODateTime = string;
export type UUID = string;

// ---------- Genéricos ----------
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PaginationQuery {
  page?: number;
  page_size?: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

export interface HealthResponse {
  status: 'ok';
  database: 'ok' | 'error';
}

// ---------- Auth ----------
export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}

// ---------- Users ----------
export interface User {
  id: UUID;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: ISODateTime;
  /** 1.1 */
  email_verified: boolean;
  /** 1.1 — aparece en el ranking solo si es true */
  ranking_opt_in: boolean;
}

export interface UserUpdate {
  full_name?: string;
  /** 1.1 */
  ranking_opt_in?: boolean;
}

export interface PasswordChange {
  current_password: string;
  new_password: string;
}

// ---------- Trips ----------
export interface TripEstimateRequest {
  mode: TransportMode;
  route?: LineStringGeometry | null;
  distance_m?: number | null;
}

export interface TripEstimate {
  mode: TransportMode;
  distance_m: number;
  co2_emitted_g: number;
  co2_saved_g: number;
  emission_factor_g_per_km: number;
  /** 1.1 */
  points_estimate: number;
}

export interface TripCreate {
  client_trip_id: UUID;
  mode: TransportMode;
  started_at: ISODateTime;
  ended_at: ISODateTime;
  route: LineStringGeometry;
  /** 1.1 — por defecto 'GPS' */
  source?: TripSource;
  /** 1.1 — obligatorio si y solo si source = 'PLANNED' (devuelto por /routes) */
  route_token?: string;
}

export interface TripSummary {
  id: UUID;
  mode: TransportMode;
  status: TripStatus;
  started_at: ISODateTime;
  ended_at: ISODateTime;
  distance_m: number;
  duration_s: number;
  co2_emitted_g: number;
  co2_saved_g: number;
  /** 1.1 */
  source: TripSource;
  /** 1.1 */
  recurrence_id: UUID | null;
  /** 1.1 */
  points: number;
}

export interface Trip extends TripSummary {
  client_trip_id: UUID;
  emission_factor_g_per_km: number;
  route: LineStringGeometry;
  created_at: ISODateTime;
  /** 1.1 */
  updated_at: ISODateTime;
}

export interface TripListQuery extends PaginationQuery {
  mode?: TransportMode;
  from?: ISODateTime;
  to?: ISODateTime;
}

// ---------- Map ----------
export interface PoiProperties {
  name: string;
  category: PoiCategory;
  description: string | null;
  attributes: Record<string, unknown>;
}
export type PoiFeature = Feature<PointGeometry, PoiProperties>;
export type PoiCollection = FeatureCollection<PointGeometry, PoiProperties>;

export interface CyclewayProperties {
  name: string | null;
  is_protected: boolean;
  length_m: number;
}
export type CyclewayFeature = Feature<LineStringGeometry, CyclewayProperties>;
export type CyclewayCollection = FeatureCollection<LineStringGeometry, CyclewayProperties>;

export interface PoiQuery {
  bbox: [number, number, number, number];
  category?: PoiCategory[];
  limit?: number;
}

// ---------- Stats ----------
export interface DateRangeQuery {
  from?: ISODateTime;
  to?: ISODateTime;
}

export interface ModeBreakdown {
  mode: TransportMode;
  trips_count: number;
  distance_m: number;
  co2_saved_g: number;
}

export interface StatsSummary {
  from: ISODateTime | null;
  to: ISODateTime | null;
  trips_count: number;
  distance_m: number;
  duration_s: number;
  co2_emitted_g: number;
  co2_saved_g: number;
  by_mode: ModeBreakdown[];
}

export interface TimeSeriesQuery {
  granularity: Granularity;
  from: ISODateTime;
  to: ISODateTime;
}

export interface TimeSeriesPoint {
  period_start: ISODateTime;
  trips_count: number;
  distance_m: number;
  co2_saved_g: number;
}

export interface TimeSeries {
  granularity: Granularity;
  points: TimeSeriesPoint[];
}

// ---------- Admin ----------
export interface AdminUserQuery extends PaginationQuery {
  q?: string;
  role?: Role;
  is_active?: boolean;
}

export interface UserStatusUpdate {
  is_active: boolean;
  /** 1.1 — 5..500 caracteres, se guarda en el AuditLog */
  reason?: string;
}

export interface UserRoleUpdate {
  role: Role;
}

export interface AdminOverview {
  users_total: number;
  users_active_30d: number;
  trips_total: number;
  co2_saved_g: number;
  distance_m: number;
  by_mode: ModeBreakdown[];
}

export interface PoiCreate {
  name: string;
  category: PoiCategory;
  description?: string | null;
  location: PointGeometry;
  attributes?: Record<string, unknown>;
}

export interface PoiUpdate extends Partial<PoiCreate> {
  is_active?: boolean;
}

export interface EmissionFactor {
  mode: TransportMode;
  grams_per_km: number;
  valid_from: ISODateTime;
  updated_by: UUID | null;
}

export interface EmissionFactorUpdate {
  grams_per_km: number;
}

export interface AuditLog {
  id: UUID;
  actor_id: UUID | null;
  action: string;
  entity_type: string;
  entity_id: UUID | null;
  payload: Record<string, unknown>;
  created_at: ISODateTime;
}

export interface AuditLogQuery extends PaginationQuery {
  actor_id?: UUID;
  action?: string;
}
