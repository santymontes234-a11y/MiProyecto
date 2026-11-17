import type { PoiCategory, Role, TransportMode, VehicleType } from '../types/enums';

export const MODE_LABELS: Record<TransportMode, string> = {
  WALK: 'Caminar',
  BICYCLE: 'Bicicleta',
  E_SCOOTER: 'Patín eléctrico',
  BUS: 'Autobús',
  CARPOOL: 'Auto compartido',
  MOTORCYCLE: 'Motocicleta',
  CAR: 'Automóvil',
};

/** 1.2 */
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  COMPACT: 'Compacto',
  SEDAN: 'Sedán',
  SUV: 'SUV',
  PICKUP: 'Pickup',
  MINIVAN: 'Minivan',
  HYBRID: 'Híbrido',
  ELECTRIC: 'Eléctrico',
};

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  BIKE_PARKING: 'Estacionamiento de bicicletas',
  BIKE_SHARING: 'Bicicleta compartida',
  BUS_STOP: 'Parada de autobús',
  EV_CHARGER: 'Cargador eléctrico',
  REPAIR_STATION: 'Estación de reparación',
};

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Usuario',
  ADMIN: 'Administrador',
  SUPER_ADMIN: 'Superadministrador',
};

/** Límites del contrato útiles para validación de UX (la API valida de nuevo). */
export const LIMITS = {
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  FULL_NAME_MAX: 120,
  MAX_ROUTE_POINTS: 10_000,
  PAGE_SIZE_MAX: 100,
} as const;
