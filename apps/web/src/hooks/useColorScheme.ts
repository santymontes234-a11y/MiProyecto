"use client";

import { useSyncExternalStore } from "react";
import { colors, type ColorScheme } from "@ecomove/shared";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Esquema activo (claro/oscuro) para librerías que necesitan colores concretos (SVG, Leaflet). */
export function useColorScheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? "dark" : "light"),
    () => "light",
  );
}

export function useThemeColors(): ColorScheme {
  return colors[useColorScheme()];
}
