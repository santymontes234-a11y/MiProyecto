import type { Metadata } from "next";
import { Bike, Bus, Footprints, Users, Zap } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Movilidad sostenible",
  description: "Qué es la movilidad sostenible, por qué importa en Querétaro y cómo elegir el medio de transporte con menor impacto.",
  alternates: { canonical: "/movilidad-sostenible" },
};

const modes = [
  { icon: Footprints, name: "Caminar", text: "Cero emisiones y la mejor opción para trayectos cortos. Mejora la salud cardiovascular." },
  { icon: Bike, name: "Bicicleta", text: "Ideal para 2–8 km. Aprovecha las ciclovías y los estacionamientos seguros de la ciudad." },
  { icon: Zap, name: "Patín eléctrico", text: "Micromovilidad para conectar con el transporte público en la última milla." },
  { icon: Bus, name: "Autobús", text: "Un autobús lleno saca decenas de autos de la calle y reduce el tráfico en horas pico." },
  { icon: Users, name: "Auto compartido", text: "Si necesitas auto, compártelo: las emisiones por persona bajan de forma importante." },
];

const tips = [
  "Planea combinando medios: bici hasta la parada y autobús para el tramo largo.",
  "Evita las horas pico cuando puedas; ganas tiempo y reduces la congestión.",
  "Revisa el mapa de EcoMove para ubicar ciclovías protegidas y estacionamientos de bicicletas.",
  "Registra tus viajes: medir tu impacto ayuda a mantener el hábito.",
];

export default function SustainableMobilityPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-[32px] font-bold leading-10">Movilidad sostenible en Querétaro</h1>
      <p className="mt-4 text-lg text-ink-muted">
        La movilidad sostenible busca que las personas lleguen a donde necesitan con el menor impacto ambiental, social y económico. En una zona metropolitana que crece tan rápido como Querétaro, elegir cómo nos movemos marca la diferencia en la calidad del aire, el tiempo de traslado y la seguridad vial.
      </p>

      <h2 className="mt-10 text-[22px] font-bold leading-7">¿Por qué importa?</h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-ink-muted">
        <li>El transporte motorizado individual es una de las principales fuentes de gases de efecto invernadero en las ciudades.</li>
        <li>Menos autos significa menos congestión, menos ruido y calles más seguras para peatones y ciclistas.</li>
        <li>Caminar y pedalear integra actividad física a la rutina diaria.</li>
      </ul>

      <h2 className="mt-10 text-[22px] font-bold leading-7">Medios de transporte</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {modes.map((m) => (
          <section key={m.name} className="rounded-lg border border-line bg-panel p-5 shadow-card">
            <m.icon className="size-6 text-brand" aria-hidden="true" />
            <h3 className="mt-2 font-semibold">{m.name}</h3>
            <p className="mt-1 text-sm text-ink-muted">{m.text}</p>
          </section>
        ))}
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        EcoMove calcula el CO₂ evitado de cada viaje en el servidor, comparándolo con el mismo trayecto en automóvil y usando factores de emisión publicados y versionados.
      </p>

      <h2 className="mt-10 text-[22px] font-bold leading-7">Consejos prácticos</h2>
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-ink-muted">
        {tips.map((t) => <li key={t}>{t}</li>)}
      </ol>

      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/registro">Empieza a registrar tus viajes</ButtonLink>
        <ButtonLink href="/mapa" variant="secondary">Ver el mapa</ButtonLink>
      </div>
    </article>
  );
}
