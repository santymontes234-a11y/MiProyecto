import { modeColors, type ColorScheme, type TransportMode } from "@ecomove/shared";

/**
 * Colores de datos derivados de los tokens de shared. El color sigue a la entidad (modo de
 * transporte), nunca a su posición. Por la regla «nunca solo color» (DESIGN_SYSTEM §2), toda
 * gráfica ofrece etiquetas/leyenda y vista de tabla.
 */
export function modeColor(mode: TransportMode): string {
  return modeColors[mode];
}

/** Orden fijo para series que no son modos de transporte. */
export function seriesColors(c: ColorScheme): string[] {
  return [c.primary, c.secondary, c.accent, c.warning];
}

export function axisTheme(c: ColorScheme) {
  return { grid: c.border, tick: c.textMuted, surface: c.surface, cursor: c.primary } as const;
}
