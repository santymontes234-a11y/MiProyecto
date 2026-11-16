export const siteConfig = {
  name: "EcoMove Querétaro",
  shortName: "EcoMove",
  description:
    "Plataforma ciudadana de movilidad sostenible en Querétaro: registra tus viajes en bici, a pie o en transporte público y mide el CO₂ que dejas de emitir.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  locale: "es_MX",
} as const;
