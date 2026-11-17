import type { Place as ApiPlace, Position } from '@ecomove/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { getItem, setItem, StorageKeys } from '@/lib/secure-storage';
import type { Place } from '@/features/trips/TripDraftProvider';

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;
const MAX_RECENTS = 6;

/** Devuelve `value` después de `ms` sin cambios. */
export function useDebounced<T>(value: T, ms = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** O2 — búsqueda de lugares por texto (GET /geocode, contrato §12.1). Nunca llama a Nominatim directamente. */
export function usePlaceSearch(text: string, near: Position | null) {
  const q = useDebounced(text.trim());
  const enabled = q.length >= MIN_CHARS;
  const query = useQuery({
    queryKey: ['geocode', q.toLowerCase(), near?.map((n) => n.toFixed(2)).join(',')],
    queryFn: () => api.geocode.search({ q: q.slice(0, 120), limit: 8, near: near ?? undefined }),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
  return { ...query, enabled, debouncing: text.trim() !== q, items: query.data?.items ?? [] };
}

export const placeFromApi = (p: ApiPlace): Place => ({ coord: p.position, label: p.name });

function isPlace(v: unknown): v is Place {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Partial<Place>;
  return typeof p.label === 'string' && Array.isArray(p.coord) && p.coord.length === 2 && p.coord.every((n) => typeof n === 'number');
}

/** Búsquedas recientes guardadas en el teléfono (máx. 6). */
export function useRecentPlaces() {
  const [recents, setRecents] = useState<Place[]>([]);

  useEffect(() => {
    let alive = true;
    void getItem(StorageKeys.recentPlaces).then((raw) => {
      if (!alive || !raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecents(parsed.filter(isPlace).slice(0, MAX_RECENTS));
      } catch {
        // Valor corrupto: se ignora.
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const remember = useCallback((place: Place) => {
    setRecents((prev) => {
      const next = [{ coord: place.coord, label: place.label.slice(0, 80) }, ...prev.filter((p) => p.label !== place.label)].slice(0, MAX_RECENTS);
      void setItem(StorageKeys.recentPlaces, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return { recents, remember };
}
