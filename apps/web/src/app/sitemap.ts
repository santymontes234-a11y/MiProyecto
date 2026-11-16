import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ["", "/mapa", "/estadisticas", "/movilidad-sostenible", "/registro", "/login", "/privacidad"].map((p) => ({
    url: `${siteConfig.url}${p}`,
    lastModified: now,
    changeFrequency: p === "" ? "daily" : "monthly",
    priority: p === "" ? 1 : 0.6,
  }));
}
