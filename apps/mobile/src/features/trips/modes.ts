import type Ionicons from '@expo/vector-icons/Ionicons';
import { MODE_LABELS, modeColors, type TransportMode } from '@ecomove/shared';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Modos sostenibles que la app ofrece para registrar viajes. */
export const SUSTAINABLE_MODES = ['BICYCLE', 'BUS', 'WALK', 'CARPOOL'] as const satisfies readonly TransportMode[];
export type SustainableMode = (typeof SUSTAINABLE_MODES)[number];

export interface ModeMeta {
  mode: TransportMode;
  label: string;
  description: string;
  icon: IconName;
  color: string;
}

const ICONS: Record<TransportMode, IconName> = {
  WALK: 'walk',
  BICYCLE: 'bicycle',
  E_SCOOTER: 'flash',
  BUS: 'bus',
  CARPOOL: 'people',
  MOTORCYCLE: 'speedometer',
  CAR: 'car',
};

const DESCRIPTIONS: Record<TransportMode, string> = {
  WALK: 'Caminata · cero emisiones',
  BICYCLE: 'Bicicleta propia o compartida',
  E_SCOOTER: 'Patín eléctrico',
  BUS: 'Transporte público',
  CARPOOL: 'Carpooling · comparte el auto',
  MOTORCYCLE: 'Motocicleta',
  CAR: 'Automóvil particular',
};

export function modeMeta(mode: TransportMode): ModeMeta {
  return { mode, label: MODE_LABELS[mode], description: DESCRIPTIONS[mode], icon: ICONS[mode], color: modeColors[mode] };
}
