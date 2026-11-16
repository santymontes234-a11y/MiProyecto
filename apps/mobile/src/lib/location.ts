import type { Position } from '@ecomove/shared';
import * as Location from 'expo-location';

export type LocationPermission = 'granted' | 'denied' | 'blocked';

/** Solicita ubicación en primer plano. «blocked» = el usuario debe habilitarla en Ajustes. */
export async function ensureForegroundPermission(): Promise<LocationPermission> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';
  const res = await Location.requestForegroundPermissionsAsync();
  if (res.granted) return 'granted';
  return res.canAskAgain ? 'denied' : 'blocked';
}

export const toPosition = (loc: Location.LocationObject): Position => [loc.coords.longitude, loc.coords.latitude];

export async function getCurrentPosition(): Promise<Position | null> {
  if (!(await Location.hasServicesEnabledAsync())) return null;
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
  if (last) return toPosition(last);
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return toPosition(loc);
}

export interface WatchHandle {
  remove: () => void;
}

export async function watchPosition(onFix: (fix: Location.LocationObject) => void, onError: (msg: string) => void): Promise<WatchHandle> {
  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 3000 },
    onFix,
    (reason) => onError(String(reason)),
  );
}

export const locationServicesEnabled = () => Location.hasServicesEnabledAsync();
