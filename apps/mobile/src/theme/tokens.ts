/**
 * Adaptador de los tokens de @ecomove/shared (DESIGN_SYSTEM.md) a StyleSheet de React Native.
 * Aquí no se declaran colores hex nuevos: todo deriva de `colors` de shared.
 */
import { colors as sharedColors, radius as sharedRadius, space, typography as sharedType, type ColorScheme as SharedScheme } from '@ecomove/shared';

export { modeColors } from '@ecomove/shared';

export interface ColorScheme {
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  /** Verde para texto de tamaño normal (contraste AA): primaryStrong del DS. */
  primaryText: string;
  onPrimary: string;
  accent: string;
  info: string;
  warning: string;
  onWarning: string;
  danger: string;
  dangerSoft: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  skeleton: string;
  overlay: string;
  tabBar: string;
}

/** Convierte #RRGGBB en rgba() con la opacidad dada. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function adapt(s: SharedScheme, dark: boolean): ColorScheme {
  return {
    primary: s.primary,
    primaryStrong: s.primaryStrong,
    primarySoft: s.primarySoft,
    primaryText: s.primaryStrong,
    onPrimary: s.onPrimary,
    accent: s.accent,
    info: s.secondary,
    warning: s.warning,
    onWarning: s.onWarning,
    danger: s.danger,
    dangerSoft: withAlpha(s.danger, dark ? 0.2 : 0.12),
    background: s.bg,
    surface: s.surface,
    surfaceAlt: s.surfaceMuted,
    border: s.border,
    text: s.text,
    textMuted: s.textMuted,
    skeleton: s.surfaceMuted,
    overlay: withAlpha(sharedColors.light.text, dark ? 0.7 : 0.45),
    tabBar: s.surface,
  };
}

export const lightColors = adapt(sharedColors.light, false);
export const darkColors = adapt(sharedColors.dark, true);

export const spacing = {
  xs: space[1],
  sm: space[2],
  md: space[3],
  lg: space[4],
  xl: space[6],
  xxl: space[8],
  xxxl: space[12],
} as const;

export const radius = { ...sharedRadius, xl: sharedRadius.lg + 8 } as const;

/** Familias de Inter cargadas en el layout raíz (expo-font). */
export const fontFamilies = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
} as const;

type Weight = keyof typeof fontFamilies;
const t = (fontSize: number, lineHeight: number, weight: Weight, letterSpacing = 0) => ({
  fontSize,
  lineHeight,
  fontFamily: fontFamilies[weight],
  letterSpacing,
});

export const typography = {
  display: t(sharedType.display.fontSize, sharedType.display.lineHeight, '800'),
  title: t(sharedType.title.fontSize, sharedType.title.lineHeight, '700'),
  subtitle: t(sharedType.heading.fontSize, sharedType.heading.lineHeight, '600'),
  body: t(sharedType.body.fontSize, sharedType.body.lineHeight, '400'),
  bodyStrong: t(sharedType.body.fontSize, sharedType.body.lineHeight, '600'),
  label: t(sharedType.label.fontSize, sharedType.label.lineHeight, '500'),
  caption: t(sharedType.caption.fontSize + 1, sharedType.caption.lineHeight + 2, '400'),
  overline: t(sharedType.caption.fontSize, sharedType.caption.lineHeight, '700', 0.8),
  /** Etiqueta de botón: 18 px bold = texto grande WCAG, válido sobre #16A34A. */
  button: t(18, 24, '700'),
} as const;

export type TypographyVariant = keyof typeof typography;

export const elevation = {
  card: {
    shadowColor: sharedColors.light.text,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;
