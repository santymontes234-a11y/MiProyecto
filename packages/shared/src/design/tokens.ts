/**
 * Tokens de diseño (docs/DESIGN_SYSTEM.md). Fuente única para web y mobile.
 * Sin dependencias de plataforma: valores numéricos en px / dp.
 */
import type { TransportMode } from '../types/enums';

/**
 * Paleta definida por el usuario (2026-11-15): verde #16A34A, verde oscuro #14532D,
 * verde claro #DCFCE7, turquesa #0D9488, azul #2563EB, amarillo #EAB308,
 * fondo claro #FFFFFF, fondo oscuro #111827.
 * Accesibilidad: `primary` sobre blanco ≈ 3.3:1 → solo rellenos, iconos y texto grande
 * (≥ 18 px bold). Texto verde de tamaño normal → `primaryStrong`. `warning` es solo relleno.
 */
const light = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  border: '#E5E7EB',
  text: '#111827',
  textMuted: '#4B5563',
  primary: '#16A34A',
  primaryStrong: '#14532D',
  primarySoft: '#DCFCE7',
  onPrimary: '#FFFFFF',
  accent: '#0D9488',
  secondary: '#2563EB',
  warning: '#EAB308',
  onWarning: '#111827',
  danger: '#DC2626',
  success: '#16A34A',
} as const;

export type ColorToken = keyof typeof light;
export type ColorScheme = Record<ColorToken, string>;

const dark: ColorScheme = {
  bg: '#111827',
  surface: '#1F2937',
  surfaceMuted: '#374151',
  border: '#374151',
  text: '#F9FAFB',
  textMuted: '#9CA3AF',
  primary: '#16A34A',
  primaryStrong: '#DCFCE7',
  primarySoft: '#14532D',
  onPrimary: '#FFFFFF',
  accent: '#0D9488',
  secondary: '#2563EB',
  warning: '#EAB308',
  onWarning: '#111827',
  danger: '#F87171',
  success: '#16A34A',
};

export const colors: { light: ColorScheme; dark: ColorScheme } = { light, dark };

export const modeColors: Record<TransportMode, string> = {
  WALK: '#14532D',
  BICYCLE: '#16A34A',
  E_SCOOTER: '#0D9488',
  BUS: '#2563EB',
  CARPOOL: '#7C3AED',
  MOTORCYCLE: '#EAB308',
  CAR: '#6B7280',
};

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export interface TextStyleToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
}

export const typography = {
  fontFamily: 'Inter',
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const satisfies Record<string, TextStyleToken | string>;

export const motion = {
  fast: 120,
  base: 200,
  easingStandard: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const map = {
  defaultCenter: [-100.3899, 20.5888] as [number, number],
  defaultZoom: 13,
  osmTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osmAttribution: '© OpenStreetMap contributors',
  minTouchTarget: 44,
} as const;

/** Variables CSS para web: `--color-primary`, `--space-4`, `--radius-md`, `--mode-bicycle`… */
export function toCssVariables(scheme: 'light' | 'dark'): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors[scheme])) {
    vars[`--color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
  }
  for (const [key, value] of Object.entries(modeColors)) {
    vars[`--mode-${key.toLowerCase().replace(/_/g, '-')}`] = value;
  }
  for (const [key, value] of Object.entries(space)) vars[`--space-${key}`] = `${value}px`;
  for (const [key, value] of Object.entries(radius)) vars[`--radius-${key}`] = `${value}px`;
  return vars;
}
