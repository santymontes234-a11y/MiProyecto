import type { Metadata } from "next";
import { InfrastructureMap } from "@/components/map/InfrastructureMap";

export const metadata: Metadata = {
  title: "Mapa de movilidad",
  description: "Ciclovías, estacionamientos de bicicletas, paradas de autobús y cargadores eléctricos en Querétaro sobre OpenStreetMap.",
  alternates: { canonical: "/mapa" },
};

export default function MapPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-[22px] font-bold leading-7">Mapa de movilidad sostenible</h1>
      <p className="mt-1 max-w-2xl text-ink-muted">Explora la infraestructura de la zona metropolitana. Mueve o acerca el mapa para cargar los puntos del área visible.</p>
      <div className="mt-6">
        <InfrastructureMap />
      </div>
    </div>
  );
}
