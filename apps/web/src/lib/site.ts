import { BRAND } from "@ecomove/shared";

/** Identidad: nombre, eslogan y lema salen de BRAND (@ecomove/shared, DESIGN_SYSTEM §0). */
export const siteConfig = {
  name: BRAND.name,
  shortName: BRAND.shortName,
  slogan: BRAND.slogan,
  tagline: BRAND.tagline,
  description:
    "Plataforma ciudadana de movilidad sostenible en Querétaro: registra tus viajes en bici, a pie o en transporte público y mide el CO₂ que dejas de emitir.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  locale: "es_MX",
} as const;
