/**
 * Cliente HTTP tipado del contrato v1.1.0. Sin dependencias: usa `fetch` (web, RN y Node 18+).
 *
 * Refresh automático: ante un 401 en un endpoint autenticado se llama UNA sola vez a
 * `refreshAccessToken` aunque haya varias peticiones concurrentes (single-flight) y se reintenta
 * cada petición una vez. Si el refresh devuelve null o falla → `onSessionExpired()` y se propaga el 401.
 *
 * Cómo guarda tokens cada plataforma lo decide la app (ADR-003):
 *  - mobile: refreshAccessToken lee el refresh de SecureStore, llama a `client.auth.refresh()`,
 *    guarda el nuevo par y devuelve el access token.
 *  - web: refreshAccessToken llama al BFF `/api/session/refresh` (cookie HttpOnly).
 */
import type {
  AdminOverview,
  AdminUserQuery,
  AuditLog,
  AuditLogQuery,
  CyclewayCollection,
  DateRangeQuery,
  EmissionFactor,
  HealthResponse,
  LoginRequest,
  Paginated,
  PaginationQuery,
  PasswordChange,
  PoiCollection,
  PoiCreate,
  PoiFeature,
  PoiQuery,
  PoiUpdate,
  RegisterRequest,
  StatsSummary,
  TimeSeries,
  TimeSeriesQuery,
  TokenPair,
  Trip,
  TripCreate,
  TripEstimate,
  TripEstimateRequest,
  TripListQuery,
  TripSummary,
  User,
  UserUpdate,
  UUID,
} from '../types/api';
import type {
  AccountDeleteRequest,
  Achievement,
  AchievementCreate,
  AchievementUpdate,
  AdminCitizenReportQuery,
  AdminTripQuery,
  AdminTripSummary,
  AnalyticsBBoxQuery,
  AnalyticsFeatureCollection,
  AnalyticsItems,
  AnalyticsQuery,
  AnalyticsSummary,
  AnalyticsTimeSeries,
  BikeLaneCoverage,
  CatalogZoneQuery,
  CitizenReport,
  CitizenReportCreate,
  CitizenReportUpdate,
  Co2Methodology,
  Corridor,
  DistanceResponse,
  GamificationProfile,
  GridCell,
  HeatmapResponse,
  InfrastructureSummary,
  MessageResponse,
  ModeCo2Breakdown,
  NotificationPage,
  NotificationQuery,
  OdFlow,
  PeakHoursResponse,
  Preferences,
  PriorityInfra,
  PriorityResponse,
  Ranking,
  RecurringTripCreate,
  RecurringTripResult,
  Report,
  ReportCreate,
  RouteCrossingPage,
  RouteCrossingRequest,
  RouteOverlap,
  RouteQuery,
  RouteResponse,
  Session,
  TransportModeInfo,
  VehicleTypeInfo,
  GeocodeQuery,
  GeocodeResponse,
  TransportModeUpdate,
  TripEstimateBatchRequest,
  TripEstimateBatchResponse,
  TripUpdate,
  UserAchievement,
  UserExport,
  UsersGrowth,
  ZoneCollection,
  ZoneCreate,
  ZoneFeature,
  ZoneStats,
  ZoneTripPage,
  ZoneTripRelation,
  ZoneUpdate,
} from '../types/api-v1-1';
import type { Granularity, RankingPeriod, ZoneKind } from '../types/enums';
import type { BBox, Position } from '../types/geojson';
import type { Role, TransportMode } from '../types/enums';
import { ApiError, isApiErrorBody } from './errors';

export interface ApiClientOptions {
  /** p. ej. "http://localhost:8000/api/v1" (sin barra final) */
  baseUrl: string;
  /** Devuelve el access token actual (en memoria) o null si no hay sesión. */
  getAccessToken: () => string | null | Promise<string | null>;
  /** Obtiene un access token nuevo. Devuelve null si la sesión ya no es recuperable. */
  refreshAccessToken?: () => Promise<string | null>;
  /** Se invoca cuando el refresh falla: limpiar sesión y llevar a login. */
  onSessionExpired?: () => void;
  /** Implementación de fetch (tests / SSR). Por defecto globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Timeout por petición en ms. Por defecto 15000. */
  timeoutMs?: number;
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
type Query = Record<string, QueryValue>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** false = endpoint público, no envía token ni intenta refresh. */
  auth?: boolean;
  /** 'json' (por defecto) o 'blob' para descargas (CSV/PDF/exportación). */
  as?: 'json' | 'blob';
}

function buildQuery(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  let refreshInFlight: Promise<string | null> | null = null;

  function refreshOnce(): Promise<string | null> {
    if (!options.refreshAccessToken) return Promise.resolve(null);
    if (!refreshInFlight) {
      refreshInFlight = options
        .refreshAccessToken()
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  }

  async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: opts.as === 'blob' ? '*/*' : 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${baseUrl}${path}${buildQuery(opts.query)}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError';
      throw new ApiError(0, aborted ? 'TIMEOUT' : 'NETWORK_ERROR', aborted ? 'Tiempo de espera agotado' : 'Error de red');
    } finally {
      clearTimeout(timer);
    }
  }

  async function parse<T>(res: Response, as: 'json' | 'blob' = 'json'): Promise<T> {
    if (res.status === 204) return undefined as T;
    if (as === 'blob' && res.ok) return (await res.blob()) as T;
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // Respuesta no JSON (p. ej. HTML de un proxy 502): error tipado, nunca SyntaxError suelto.
        throw new ApiError(res.status, res.ok ? 'INVALID_RESPONSE' : 'INTERNAL_ERROR', `HTTP ${res.status}: respuesta no JSON`);
      }
    }
    if (res.ok) return data as T;
    if (isApiErrorBody(data)) {
      throw new ApiError(res.status, data.error.code, data.error.message, data.error.details);
    }
    throw new ApiError(res.status, 'INTERNAL_ERROR', `HTTP ${res.status}`);
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const useAuth = opts.auth !== false;
    const token = useAuth ? await options.getAccessToken() : null;
    let res = await send(path, opts, token);

    if (res.status === 401 && useAuth && options.refreshAccessToken) {
      const newToken = await refreshOnce();
      if (newToken) {
        res = await send(path, opts, newToken);
      }
      if (res.status === 401) options.onSessionExpired?.();
    }
    return parse<T>(res, opts.as);
  }

  /** Parámetros comunes de /admin/analytics/* (mode repetible, bbox como texto). */
  function analyticsQuery(q: AnalyticsQuery & { bbox?: BBox }, extra: Query = {}): Query {
    const { bbox, mode, ...rest } = q;
    return { ...rest, mode, bbox: bbox ? bboxToParam(bbox) : undefined, ...extra };
  }

  return {
    health: () => request<HealthResponse>('/health', { auth: false }),

    auth: {
      /** ⚠ 1.1: con verificación obligatoria responde 202 MessageResponse sin tokens (usar isTokenPair). */
      register: (body: RegisterRequest) =>
        request<TokenPair | MessageResponse>('/auth/register', { method: 'POST', body, auth: false }),
      login: (body: LoginRequest) =>
        request<TokenPair>('/auth/login', { method: 'POST', body, auth: false }),
      refresh: (refreshToken: string) =>
        request<TokenPair>('/auth/refresh', {
          method: 'POST',
          body: { refresh_token: refreshToken },
          auth: false,
        }),
      logout: (refreshToken: string) =>
        request<void>('/auth/logout', {
          method: 'POST',
          body: { refresh_token: refreshToken },
          auth: false,
        }),
      logoutAll: () => request<void>('/auth/logout-all', { method: 'POST' }),
      sessions: () => request<Session[]>('/auth/sessions'),
      revokeSession: (sessionId: UUID) =>
        request<void>(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
      requestPasswordReset: (email: string) =>
        request<MessageResponse>('/auth/password-reset/request', {
          method: 'POST',
          body: { email },
          auth: false,
        }),
      confirmPasswordReset: (token: string, newPassword: string) =>
        request<void>('/auth/password-reset/confirm', {
          method: 'POST',
          body: { token, new_password: newPassword },
          auth: false,
        }),
      requestEmailVerification: (email: string) =>
        request<MessageResponse>('/auth/email-verification/request', {
          method: 'POST',
          body: { email },
          auth: false,
        }),
      confirmEmailVerification: (token: string) =>
        request<void>('/auth/email-verification/confirm', {
          method: 'POST',
          body: { token },
          auth: false,
        }),
    },

    users: {
      me: () => request<User>('/users/me'),
      updateMe: (body: UserUpdate) => request<User>('/users/me', { method: 'PATCH', body }),
      changePassword: (body: PasswordChange) =>
        request<void>('/users/me/password', { method: 'POST', body }),
      preferences: () => request<Preferences>('/users/me/preferences'),
      updatePreferences: (body: Preferences) =>
        request<Preferences>('/users/me/preferences', { method: 'PUT', body }),
      achievements: () => request<UserAchievement[]>('/users/me/achievements'),
      /** Devuelve el JSON de UserExport como Blob para guardarlo como archivo. */
      exportData: () => request<Blob>('/users/me/export', { as: 'blob' }),
      deleteAccount: (body: AccountDeleteRequest) =>
        request<void>('/users/me', { method: 'DELETE', body }),
    },

    trips: {
      estimate: (body: TripEstimateRequest) =>
        request<TripEstimate>('/trips/estimate', { method: 'POST', body }),
      create: (body: TripCreate) => request<Trip>('/trips', { method: 'POST', body }),
      list: (query: TripListQuery = {}) =>
        request<Paginated<TripSummary>>('/trips', { query: { ...query } }),
      get: (tripId: UUID) => request<Trip>(`/trips/${encodeURIComponent(tripId)}`),
      remove: (tripId: UUID) =>
        request<void>(`/trips/${encodeURIComponent(tripId)}`, { method: 'DELETE' }),
      estimateBatch: (body: TripEstimateBatchRequest) =>
        request<TripEstimateBatchResponse>('/trips/estimate/batch', { method: 'POST', body }),
      update: (tripId: UUID, body: TripUpdate) =>
        request<Trip>(`/trips/${encodeURIComponent(tripId)}`, { method: 'PATCH', body }),
      createRecurring: (body: RecurringTripCreate) =>
        request<RecurringTripResult>('/trips/recurring', { method: 'POST', body }),
    },

    routes: {
      get: ({ origin, destination, mode }: RouteQuery) =>
        request<RouteResponse>('/routes', {
          query: { origin: positionToParam(origin), destination: positionToParam(destination), mode },
        }),
    },

    /** 1.2 — §12.1 búsqueda de lugares (POIs propios + Nominatim vía backend). */
    geocode: {
      search: ({ q, limit, near }: GeocodeQuery) =>
        request<GeocodeResponse>('/geocode', {
          query: { q, limit, near: near ? positionToParam(near) : undefined },
        }),
    },

    catalog: {
      transportModes: () =>
        request<TransportModeInfo[]>('/catalog/transport-modes', { auth: false }),
      /** 1.2 */
      vehicleTypes: () => request<VehicleTypeInfo[]>('/catalog/vehicle-types', { auth: false }),
      zones: ({ bbox, kind }: CatalogZoneQuery = {}) =>
        request<ZoneCollection>('/catalog/zones', {
          auth: false,
          query: { bbox: bbox ? bboxToParam(bbox) : undefined, kind },
        }),
    },

    gamification: {
      achievements: () => request<Achievement[]>('/achievements', { auth: false }),
      me: () => request<GamificationProfile>('/gamification/me'),
      ranking: (period: RankingPeriod = 'week') =>
        request<Ranking>('/gamification/ranking', { query: { period } }),
    },

    notifications: {
      list: (query: NotificationQuery = {}) =>
        request<NotificationPage>('/notifications', { query: { ...query } }),
      markRead: (notificationId: UUID) =>
        request<void>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' }),
      markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
    },

    citizenReports: {
      create: (body: CitizenReportCreate) =>
        request<CitizenReport>('/citizen-reports', { method: 'POST', body }),
      mine: (query: PaginationQuery = {}) =>
        request<Paginated<CitizenReport>>('/citizen-reports/mine', { query: { ...query } }),
    },

    map: {
      pois: ({ bbox, category, limit }: PoiQuery) =>
        request<PoiCollection>('/map/pois', {
          auth: false,
          query: { bbox: bboxToParam(bbox), category, limit },
        }),
      poi: (poiId: UUID) =>
        request<PoiFeature>(`/map/pois/${encodeURIComponent(poiId)}`, { auth: false }),
      cycleways: (bbox: BBox) =>
        request<CyclewayCollection>('/map/cycleways', {
          auth: false,
          query: { bbox: bboxToParam(bbox) },
        }),
    },

    stats: {
      me: (query: DateRangeQuery = {}) => request<StatsSummary>('/stats/me', { query: { ...query } }),
      meTimeseries: (query: TimeSeriesQuery) =>
        request<TimeSeries>('/stats/me/timeseries', { query: { ...query } }),
      city: (query: DateRangeQuery = {}) =>
        request<StatsSummary>('/stats/city', { query: { ...query }, auth: false }),
    },

    admin: {
      users: (query: AdminUserQuery = {}) =>
        request<Paginated<User>>('/admin/users', { query: { ...query } }),
      user: (userId: UUID) => request<User>(`/admin/users/${encodeURIComponent(userId)}`),
      setUserStatus: (userId: UUID, isActive: boolean, reason?: string) =>
        request<User>(`/admin/users/${encodeURIComponent(userId)}/status`, {
          method: 'PATCH',
          body: reason === undefined ? { is_active: isActive } : { is_active: isActive, reason },
        }),
      deleteUser: (userId: UUID, reason: string) =>
        request<void>(`/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          body: { reason },
        }),
      trips: (query: AdminTripQuery = {}) =>
        request<Paginated<AdminTripSummary>>('/admin/trips', { query: { ...query } }),
      deleteTrip: (tripId: UUID, reason: string) =>
        request<void>(`/admin/trips/${encodeURIComponent(tripId)}`, {
          method: 'DELETE',
          body: { reason },
        }),
      createZone: (body: ZoneCreate) => request<ZoneFeature>('/admin/zones', { method: 'POST', body }),
      updateZone: (zoneId: UUID, body: ZoneUpdate) =>
        request<ZoneFeature>(`/admin/zones/${encodeURIComponent(zoneId)}`, { method: 'PATCH', body }),
      deleteZone: (zoneId: UUID) =>
        request<void>(`/admin/zones/${encodeURIComponent(zoneId)}`, { method: 'DELETE' }),
      updateTransportMode: (mode: TransportMode, body: TransportModeUpdate) =>
        request<TransportModeInfo>(`/admin/transport-modes/${mode}`, { method: 'PATCH', body }),
      createAchievement: (body: AchievementCreate) =>
        request<Achievement>('/admin/achievements', { method: 'POST', body }),
      updateAchievement: (achievementId: UUID, body: AchievementUpdate) =>
        request<Achievement>(`/admin/achievements/${encodeURIComponent(achievementId)}`, {
          method: 'PATCH',
          body,
        }),
      reports: (query: PaginationQuery = {}) =>
        request<Paginated<Report>>('/admin/reports', { query: { ...query } }),
      createReport: (body: ReportCreate) => request<Report>('/admin/reports', { method: 'POST', body }),
      downloadReport: (reportId: UUID) =>
        request<Blob>(`/admin/reports/${encodeURIComponent(reportId)}/download`, { as: 'blob' }),
      citizenReports: ({ bbox, ...query }: AdminCitizenReportQuery = {}) =>
        request<Paginated<CitizenReport>>('/admin/citizen-reports', {
          query: { ...query, bbox: bbox ? bboxToParam(bbox) : undefined },
        }),
      updateCitizenReport: (reportId: UUID, body: CitizenReportUpdate) =>
        request<CitizenReport>(`/admin/citizen-reports/${encodeURIComponent(reportId)}`, {
          method: 'PATCH',
          body,
        }),
      setUserRole: (userId: UUID, role: Role) =>
        request<User>(`/admin/users/${encodeURIComponent(userId)}/role`, {
          method: 'PATCH',
          body: { role },
        }),
      overview: (query: DateRangeQuery = {}) =>
        request<AdminOverview>('/admin/stats/overview', { query: { ...query } }),
      createPoi: (body: PoiCreate) =>
        request<PoiFeature>('/admin/map/pois', { method: 'POST', body }),
      updatePoi: (poiId: UUID, body: PoiUpdate) =>
        request<PoiFeature>(`/admin/map/pois/${encodeURIComponent(poiId)}`, {
          method: 'PATCH',
          body,
        }),
      deletePoi: (poiId: UUID) =>
        request<void>(`/admin/map/pois/${encodeURIComponent(poiId)}`, { method: 'DELETE' }),
      emissionFactors: () => request<EmissionFactor[]>('/admin/emission-factors'),
      setEmissionFactor: (mode: TransportMode, gramsPerKm: number) =>
        request<EmissionFactor>(`/admin/emission-factors/${mode}`, {
          method: 'PUT',
          body: { grams_per_km: gramsPerKm },
        }),
      auditLogs: (query: AuditLogQuery = {}) =>
        request<Paginated<AuditLog>>('/admin/audit-logs', { query: { ...query } }),
    },

    analytics: {
      summary: (q: AnalyticsQuery = {}) =>
        request<AnalyticsSummary>('/admin/analytics/summary', { query: analyticsQuery(q) }),
      modes: (q: AnalyticsQuery = {}) =>
        request<AnalyticsItems<ModeCo2Breakdown>>('/admin/analytics/modes', { query: analyticsQuery(q) }),
      peakHours: (q: AnalyticsQuery & { by_weekday?: boolean } = {}) =>
        request<PeakHoursResponse>('/admin/analytics/peak-hours', { query: analyticsQuery(q) }),
      timeseries: (q: AnalyticsQuery & { granularity?: Granularity } = {}) =>
        request<AnalyticsTimeSeries>('/admin/analytics/timeseries', { query: analyticsQuery(q) }),
      usersGrowth: (q: AnalyticsQuery & { granularity?: Granularity } = {}) =>
        request<UsersGrowth>('/admin/analytics/users-growth', { query: analyticsQuery(q) }),
      infrastructure: (q: AnalyticsQuery & { bbox?: BBox } = {}) =>
        request<InfrastructureSummary>('/admin/analytics/infrastructure', { query: analyticsQuery(q) }),
      co2Methodology: () => request<Co2Methodology>('/admin/analytics/co2-methodology'),
      zones: (q: AnalyticsQuery & { kind?: ZoneKind } = {}) =>
        request<AnalyticsFeatureCollection<ZoneStats>>('/admin/analytics/zones', {
          query: analyticsQuery(q),
        }),
      zoneTrips: (
        zoneId: UUID,
        q: AnalyticsQuery & PaginationQuery & { relation?: ZoneTripRelation } = {},
      ) =>
        request<ZoneTripPage>(`/admin/analytics/zones/${encodeURIComponent(zoneId)}/trips`, {
          query: analyticsQuery(q),
        }),
      odFlows: (q: AnalyticsQuery & { kind?: ZoneKind; limit?: number } = {}) =>
        request<AnalyticsFeatureCollection<OdFlow>>('/admin/analytics/od-flows', {
          query: analyticsQuery(q),
        }),
      grid: (
        q: AnalyticsBBoxQuery & { metric?: 'origin' | 'destination' | 'route'; shape?: 'hex' | 'square' },
      ) => request<AnalyticsFeatureCollection<GridCell>>('/admin/analytics/grid', { query: analyticsQuery(q) }),
      heatmap: (q: AnalyticsBBoxQuery & { point?: 'origin' | 'destination' | 'both' }) =>
        request<HeatmapResponse>('/admin/analytics/heatmap', { query: analyticsQuery(q) }),
      corridors: (q: AnalyticsBBoxQuery & { quantile?: number; min_cells?: number }) =>
        request<AnalyticsFeatureCollection<Corridor>>('/admin/analytics/corridors', {
          query: analyticsQuery(q),
        }),
      bikeLaneCoverage: (q: AnalyticsQuery & { buffer_m?: number } = {}) =>
        request<BikeLaneCoverage>('/admin/analytics/bike-lane-coverage', { query: analyticsQuery(q) }),
      routeCrossings: (body: RouteCrossingRequest, q: AnalyticsQuery & PaginationQuery = {}) =>
        request<RouteCrossingPage>('/admin/analytics/route-crossings', {
          method: 'POST',
          body,
          query: analyticsQuery(q),
        }),
      routeOverlap: (tripA: UUID, tripB: UUID, toleranceM?: number) =>
        request<RouteOverlap>('/admin/analytics/route-overlap', {
          query: { trip_a: tripA, trip_b: tripB, tolerance_m: toleranceM },
        }),
      distance: (origin: Position, destination: Position) =>
        request<DistanceResponse>('/admin/analytics/distance', {
          query: { origin: positionToParam(origin), destination: positionToParam(destination) },
        }),
      infrastructurePriority: (q: AnalyticsBBoxQuery & { infra: PriorityInfra }) =>
        request<PriorityResponse>('/admin/analytics/infrastructure-priority', {
          query: analyticsQuery(q),
        }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function bboxToParam(bbox: BBox): string {
  return bbox.join(',');
}

function positionToParam([lng, lat]: Position): string {
  return `${lng},${lat}`;
}

/** Distingue la respuesta 201 TokenPair de la 202 MessageResponse de register (contrato 1.1 §2.2). */
export function isTokenPair(value: TokenPair | MessageResponse): value is TokenPair {
  return 'access_token' in value;
}
