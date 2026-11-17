import type { ColorScheme, PriorityLabel } from "@ecomove/shared";

/** Mezcla lineal de dos colores #RRGGBB (t ∈ [0, 1]). */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16));
  const k = Math.min(1, Math.max(0, t));
  return `#${pa.map((v, i) => Math.round(v + ((pb[i] ?? v) - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

/** Rampa secuencial del sistema de diseño: primarySoft → primary → primaryStrong. */
export function heatColor(c: ColorScheme, t: number): string {
  return t <= 0.5 ? mix(c.primarySoft, c.primary, t * 2) : mix(c.primary, c.primaryStrong, (t - 0.5) * 2);
}

/** Tres clases con nombre: el color nunca es la única señal (también cambian tamaño y texto). */
export const HEAT_CLASSES = [
  { key: "low", label: "Baja", min: 0, t: 0.15, radius: 7 },
  { key: "mid", label: "Media", min: 1 / 3, t: 0.5, radius: 13 },
  { key: "high", label: "Alta", min: 2 / 3, t: 0.95, radius: 20 },
] as const;

export function heatClass(ratio: number) {
  return [...HEAT_CLASSES].reverse().find((k) => ratio >= k.min) ?? HEAT_CLASSES[0];
}

export const PRIORITY_LABELS: Record<PriorityLabel, string> = {
  candidata_prioritaria_para_estudio: "Candidata prioritaria para estudio",
  candidata_para_evaluar: "Candidata para evaluar",
  sin_senal_prioritaria: "Sin señal prioritaria",
  datos_insuficientes: "Datos insuficientes",
};

/** Orden de la leyenda y estilo de cada clase: relleno + trazo + patrón de línea + glifo. */
export const PRIORITY_ORDER: PriorityLabel[] = [
  "candidata_prioritaria_para_estudio",
  "candidata_para_evaluar",
  "sin_senal_prioritaria",
  "datos_insuficientes",
];

export const PRIORITY_GLYPH: Record<PriorityLabel, string> = {
  candidata_prioritaria_para_estudio: "▲",
  candidata_para_evaluar: "●",
  sin_senal_prioritaria: "○",
  datos_insuficientes: "?",
};

export interface CellStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  weight: number;
  dashArray?: string;
}

export function priorityStyle(c: ColorScheme, label: PriorityLabel): CellStyle {
  switch (label) {
    case "candidata_prioritaria_para_estudio":
      return { fill: c.primaryStrong, fillOpacity: 0.55, stroke: c.primaryStrong, weight: 2.5 };
    case "candidata_para_evaluar":
      return { fill: c.primary, fillOpacity: 0.35, stroke: c.primary, weight: 1.5 };
    case "sin_senal_prioritaria":
      return { fill: c.primarySoft, fillOpacity: 0.2, stroke: c.border, weight: 1 };
    default:
      return { fill: c.surfaceMuted, fillOpacity: 0.15, stroke: c.textMuted, weight: 1, dashArray: "4 4" };
  }
}

export const INFRA_LABELS = {
  bike_lane: "Ciclovía",
  bike_station: "Estación de bicicletas",
  bus_stop: "Parada de autobús",
  pedestrian: "Mejora peatonal",
} as const;
