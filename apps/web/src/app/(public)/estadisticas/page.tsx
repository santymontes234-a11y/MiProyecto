import type { Metadata } from "next";
import { CityStats } from "@/components/stats/CityStats";

export const metadata: Metadata = {
  title: "Estadísticas de la ciudad",
  description: "Viajes sostenibles, distancia y CO₂ evitado por la comunidad de EcoMove en Querétaro.",
  alternates: { canonical: "/estadisticas" },
};

export default function CityStatsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-[22px] font-bold leading-7">Estadísticas de la ciudad</h1>
      <p className="mb-6 mt-1 max-w-2xl text-ink-muted">Así se mueve la comunidad EcoMove en la Zona Metropolitana de Querétaro.</p>
      <CityStats />
    </div>
  );
}
