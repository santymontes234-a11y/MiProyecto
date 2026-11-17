import { ApiError, type Position, type RouteResponse, type Trip, type TripCreate } from '@ecomove/shared';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { api } from '@/lib/api';
import { isNetworkError } from '@/lib/errors';
import { fitToPointLimit, pathLengthM, toLineString } from '@/lib/geo';
import { watchPosition, type WatchHandle } from '@/lib/location';
import { removePendingTrip, savePendingTrip } from './pending-trips';
import { evaluateFix, type GpsFix } from './track-filter';
import type { SustainableMode } from './modes';
import { usesVehicle, type VehicleChoice } from './vehicle';

export interface Place {
  coord: Position;
  label: string;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'uploading' | 'done' | 'error';

interface Recording {
  status: RecordingStatus;
  points: Position[];
  startedAt: string | null;
  endedAt: string | null;
  lastFix: GpsFix | null;
  gpsError: string | null;
}

interface TripDraftValue {
  origin: Place | null;
  destination: Place | null;
  mode: SustainableMode | null;
  /** O4/O5: tipo de vehículo y ocupantes (solo CAR/CARPOOL). */
  vehicle: VehicleChoice | null;
  setVehicle: (v: VehicleChoice | null) => void;
  recording: Recording;
  /** Distancia recorrida aproximada (solo visual; la oficial la calcula la API). */
  liveDistanceM: number;
  /** Ruta calculada por /routes para el modo elegido (null si el ruteo no está disponible). */
  plannedRoute: RouteResponse | null;
  /** true si el último fallo dejó el viaje guardado en el teléfono para reintentarlo. */
  savedLocally: boolean;
  result: Trip | null;
  uploadError: unknown;
  setPlannedRoute: (r: RouteResponse | null) => void;
  /** Registra un viaje ya realizado con la ruta planificada (source PLANNED + route_token). */
  submitPlanned: () => Promise<Trip | null>;
  setOrigin: (p: Place | null) => void;
  setDestination: (p: Place | null) => void;
  swapPlaces: () => void;
  setMode: (m: SustainableMode) => void;
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => Promise<void>;
  finishAndUpload: () => Promise<Trip | null>;
  retryUpload: () => Promise<Trip | null>;
  discardRecording: () => void;
  reset: () => void;
}

const EMPTY_RECORDING: Recording = { status: 'idle', points: [], startedAt: null, endedAt: null, lastFix: null, gpsError: null };

const TripDraftContext = createContext<TripDraftValue | null>(null);

export class RouteTooShortError extends Error {
  constructor() {
    super('La ruta registrada es demasiado corta.');
    this.name = 'RouteTooShortError';
  }
}

export function TripDraftProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [mode, setMode] = useState<SustainableMode | null>(null);
  const [vehicle, setVehicle] = useState<VehicleChoice | null>(null);
  const [recording, setRecording] = useState<Recording>(EMPTY_RECORDING);
  const [result, setResult] = useState<Trip | null>(null);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [plannedRoute, setPlannedRoute] = useState<RouteResponse | null>(null);
  const [savedLocally, setSavedLocally] = useState(false);
  const watchRef = useRef<WatchHandle | null>(null);
  /** Payload pendiente: se reutiliza al reintentar para conservar client_trip_id (idempotencia). */
  const pendingRef = useRef<TripCreate | null>(null);

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  useEffect(() => stopWatch, [stopWatch]);

  const startWatch = useCallback(async () => {
    stopWatch();
    watchRef.current = await watchPosition(
      (loc) => {
        const fix: GpsFix = {
          coord: [loc.coords.longitude, loc.coords.latitude],
          timestamp: loc.timestamp,
          accuracy: loc.coords.accuracy,
          mocked: loc.mocked,
        };
        setRecording((r) => {
          if (r.status !== 'recording') return r;
          const decision = evaluateFix(r.lastFix, fix);
          if (decision !== 'accept') return r;
          return { ...r, points: [...r.points, fix.coord], lastFix: fix, gpsError: null };
        });
      },
      (msg) => setRecording((r) => ({ ...r, gpsError: msg })),
    );
  }, [stopWatch]);

  const startRecording = useCallback(async () => {
    setResult(null);
    setUploadError(null);
    pendingRef.current = null;
    setRecording({ ...EMPTY_RECORDING, status: 'recording', startedAt: new Date().toISOString() });
    await startWatch();
  }, [startWatch]);

  const pauseRecording = useCallback(() => {
    stopWatch();
    setRecording((r) => (r.status === 'recording' ? { ...r, status: 'paused', lastFix: null } : r));
  }, [stopWatch]);

  const resumeRecording = useCallback(async () => {
    setRecording((r) => (r.status === 'paused' ? { ...r, status: 'recording' } : r));
    await startWatch();
  }, [startWatch]);

  const upload = useCallback(
    async (payload: TripCreate): Promise<Trip | null> => {
      setRecording((r) => ({ ...r, status: 'uploading' }));
      setUploadError(null);
      setSavedLocally(false);
      try {
        const trip = await api.trips.create(payload);
        pendingRef.current = null;
        removePendingTrip(payload.client_trip_id);
        setResult(trip);
        setRecording((r) => ({ ...r, status: 'done' }));
        void queryClient.invalidateQueries({ queryKey: ['trips'] });
        void queryClient.invalidateQueries({ queryKey: ['stats'] });
        void queryClient.invalidateQueries({ queryKey: ['gamification'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        return trip;
      } catch (e) {
        // Contrato §4.1: conservar en local los viajes rechazados con MODE_INACTIVE; también los
        // que fallan por red, para no perderlos si se cierra la app.
        const keep = isNetworkError(e) || (e instanceof ApiError && e.code === 'MODE_INACTIVE');
        if (keep) {
          try {
            await savePendingTrip(payload, e instanceof ApiError ? e.code : 'UNKNOWN');
            setSavedLocally(true);
          } catch {
            setSavedLocally(false);
          }
        }
        setUploadError(e);
        setRecording((r) => ({ ...r, status: 'error' }));
        return null;
      }
    },
    [queryClient],
  );

  const finishAndUpload = useCallback(async (): Promise<Trip | null> => {
    stopWatch();
    if (!mode || !recording.startedAt) return null;
    const coords = fitToPointLimit(recording.points);
    if (coords.length < 2) {
      const err = new RouteTooShortError();
      setUploadError(err);
      setRecording((r) => ({ ...r, status: 'error' }));
      return null;
    }
    const endedAt = new Date().toISOString();
    const payload: TripCreate = {
      client_trip_id: randomUUID(),
      mode,
      started_at: recording.startedAt,
      ended_at: endedAt,
      route: toLineString(coords),
      ...(usesVehicle(mode) && vehicle ? vehicle : {}),
    };
    pendingRef.current = payload;
    setRecording((r) => ({ ...r, endedAt }));
    return upload(payload);
  }, [mode, vehicle, recording.points, recording.startedAt, stopWatch, upload]);

  const submitPlanned = useCallback(async (): Promise<Trip | null> => {
    if (!mode || !plannedRoute) return null;
    const ended = new Date();
    const started = new Date(ended.getTime() - Math.max(60, plannedRoute.duration_s) * 1000);
    const payload: TripCreate = {
      client_trip_id: randomUUID(),
      mode,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      // Contrato §12: route y route_token tal cual los devolvió /routes.
      route: plannedRoute.route,
      source: 'PLANNED',
      route_token: plannedRoute.route_token,
      ...(usesVehicle(mode) && vehicle ? vehicle : {}),
    };
    pendingRef.current = payload;
    setResult(null);
    setRecording({ ...EMPTY_RECORDING, status: 'uploading', startedAt: payload.started_at, endedAt: payload.ended_at });
    return upload(payload);
  }, [mode, vehicle, plannedRoute, upload]);

  const retryUpload = useCallback(async () => {
    const payload = pendingRef.current;
    return payload ? upload(payload) : null;
  }, [upload]);

  const discardRecording = useCallback(() => {
    stopWatch();
    pendingRef.current = null;
    setUploadError(null);
    setSavedLocally(false);
    setRecording(EMPTY_RECORDING);
  }, [stopWatch]);

  const reset = useCallback(() => {
    discardRecording();
    setOrigin(null);
    setDestination(null);
    setMode(null);
    setVehicle(null);
    setPlannedRoute(null);
    setResult(null);
  }, [discardRecording]);

  const swapPlaces = useCallback(() => {
    setOrigin(destination);
    setDestination(origin);
  }, [origin, destination]);

  const liveDistanceM = useMemo(() => pathLengthM(recording.points), [recording.points]);

  const value = useMemo<TripDraftValue>(
    () => ({
      origin,
      destination,
      mode,
      vehicle,
      setVehicle,
      recording,
      liveDistanceM,
      plannedRoute,
      savedLocally,
      result,
      uploadError,
      setPlannedRoute,
      submitPlanned,
      setOrigin,
      setDestination,
      swapPlaces,
      setMode,
      startRecording,
      pauseRecording,
      resumeRecording,
      finishAndUpload,
      retryUpload,
      discardRecording,
      reset,
    }),
    [origin, destination, mode, vehicle, recording, liveDistanceM, plannedRoute, savedLocally, result, uploadError, submitPlanned, swapPlaces, startRecording, pauseRecording, resumeRecording, finishAndUpload, retryUpload, discardRecording, reset],
  );

  return <TripDraftContext.Provider value={value}>{children}</TripDraftContext.Provider>;
}

export function useTripDraft(): TripDraftValue {
  const ctx = useContext(TripDraftContext);
  if (!ctx) throw new Error('useTripDraft debe usarse dentro de <TripDraftProvider>');
  return ctx;
}
