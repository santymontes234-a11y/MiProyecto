import type { TripCreate } from '@ecomove/shared';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Viajes que el servidor rechazó por motivos temporales (p. ej. 422 MODE_INACTIVE, contrato §4.1)
 * o que no se pudieron enviar sin conexión. Se guardan en el almacenamiento privado de la app
 * (no en SecureStore: las trazas pueden pesar cientos de KB) y se reintentan con el mismo
 * client_trip_id, de modo que el envío es idempotente.
 */
export interface PendingTrip {
  payload: TripCreate;
  reason: string;
  saved_at: string;
}

const dir = () => new Directory(Paths.document, 'pending-trips');
const fileFor = (id: string) => new File(dir(), `${id}.json`);

function ensureDir(): void {
  const d = dir();
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
}

export async function savePendingTrip(payload: TripCreate, reason: string): Promise<void> {
  ensureDir();
  const entry: PendingTrip = { payload, reason, saved_at: new Date().toISOString() };
  const f = fileFor(payload.client_trip_id);
  if (!f.exists) f.create();
  await f.write(JSON.stringify(entry));
}

export async function listPendingTrips(): Promise<PendingTrip[]> {
  const d = dir();
  if (!d.exists) return [];
  const out: PendingTrip[] = [];
  for (const item of d.list()) {
    if (!(item instanceof File) || !item.name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(await item.text()) as PendingTrip);
    } catch {
      item.delete();
    }
  }
  return out.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

export function removePendingTrip(clientTripId: string): void {
  const f = fileFor(clientTripId);
  if (f.exists) f.delete();
}
