import type { Metadata } from "next";
import { Bike, BarChart3, Leaf, MapPinned, ShieldCheck, Smartphone, Trees, Users, Wind } from "lucide-react";
import { formatCo2, formatDistance } from "@ecomove/shared";
import { getCityStats } from "@/lib/api.server";
import { formatNumber } from "@/lib/format";
import { siteConfig } from "@/lib/site";
import { ButtonLink } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { ModeShareChart } from "@/components/stats/ModeShareChart";

export const metadata: Metadata = { alternates: { canonical: "/" } };
export const revalidate = 300;

const benefits = [
  { icon: Wind, title: "Aire más limpio", text: "Cada viaje a pie, en bici o en transporte público reduce emisiones y partículas en las calles de Querétaro." },
  { icon: Leaf, title: "CO₂ medido, no estimado a ojo", text: "El cálculo lo hace el servidor con factores de emisión versionados; ves exactamente cuánto evitaste." },
  { icon: Users, title: "Ciudad con datos", text: "Las cifras agregadas y anónimas ayudan a planear ciclovías, paradas y estaciones donde más se necesitan." },
  { icon: ShieldCheck, title: "Privacidad primero", text: "Tus trazas GPS solo las ves tú. La administración consulta agregados, nunca recorridos individuales." },
];

const steps = [
  { icon: Smartphone, title: "Registra tu viaje", text: "Inicia el viaje en la app Android y elige caminar, bici, patín, autobús o auto compartido." },
  { icon: MapPinned, title: "Muévete por la ciudad", text: "La app guarda tu recorrido en el teléfono y lo sube completo al terminar." },
  { icon: Leaf, title: "Mide tu impacto", text: "EcoMove calcula la distancia real y el CO₂ que evitaste frente al automóvil." },
  { icon: BarChart3, title: "Sigue tu progreso", text: "Consulta tu historial y tus estadísticas desde la web o el teléfono, con la misma cuenta." },
];

export default async function HomePage() {
  const stats = await getCityStats();
  const hasStats = !!stats && stats.trips_count > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteConfig.name,
    url: siteConfig.url,
    applicationCategory: "LifestyleApplication",
    description: siteConfig.description,
    areaServed: { "@type": "City", name: "Santiago de Querétaro" },
    inLanguage: "es-MX",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden bg-brand-soft/60">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-panel px-3 py-1 text-xs font-semibold text-brand-strong shadow-card">
              <Bike className="size-4" aria-hidden="true" /> Movilidad sostenible en Querétaro
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              Muévete limpio y <span className="text-brand-strong">mide el CO₂</span> que dejas de emitir
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-muted">
              EcoMove Querétaro registra tus trayectos a pie, en bicicleta o en transporte público, calcula tus emisiones evitadas y muestra a la ciudad dónde crece la movilidad sostenible.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/registro" size="lg">Crear cuenta gratis</ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">Iniciar sesión</ButtonLink>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-panel p-6 shadow-card" aria-label="Impacto de la comunidad">
            <p className="text-sm font-medium text-ink-muted">CO₂ evitado por la comunidad</p>
            <p className="mt-2 text-[32px] font-bold leading-10 text-brand-strong">{hasStats ? formatCo2(stats.co2_saved_g) : "—"}</p>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-ink-muted">Viajes sostenibles</dt><dd className="text-lg font-semibold">{hasStats ? formatNumber(stats.trips_count) : "—"}</dd></div>
              <div><dt className="text-ink-muted">Distancia recorrida</dt><dd className="text-lg font-semibold">{hasStats ? formatDistance(stats.distance_m) : "—"}</dd></div>
            </dl>
            {!hasStats && <p className="mt-4 text-xs text-ink-muted">Publicamos cifras cuando hay suficientes viajes para proteger la privacidad de cada persona.</p>}
          </div>
        </div>
      </section>

      <section id="proyecto" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[22px] font-bold leading-7">El proyecto</h2>
            <p className="mt-4 text-ink-muted">
              EcoMove Querétaro es una plataforma ciudadana para la Zona Metropolitana de Querétaro. Une una app Android para registrar viajes, este sitio web para consultar tu historial y un panel para que la administración tome decisiones con datos agregados.
            </p>
            <p className="mt-4 text-ink-muted">
              Mostramos la infraestructura de movilidad sostenible —ciclovías, estacionamientos de bicicletas, paradas y cargadores— sobre OpenStreetMap.
            </p>
            <ButtonLink href="/mapa" variant="secondary" className="mt-6">Explorar el mapa</ButtonLink>
          </div>
          <div id="beneficios" className="grid scroll-mt-20 gap-4 sm:grid-cols-2">
            <h2 className="sr-only">Beneficios ambientales</h2>
            {benefits.map((b) => (
              <article key={b.title} className="rounded-lg border border-line bg-panel p-5 shadow-card">
                <b.icon className="size-6 text-brand" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{b.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 border-y border-line bg-subtle">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-[22px] font-bold leading-7">Cómo funciona</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-lg bg-panel p-5 shadow-card">
                <span className="absolute right-4 top-4 text-sm font-bold text-ink-muted" aria-hidden="true">{i + 1}</span>
                <s.icon className="size-6 text-aqua" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="estadisticas" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-bold leading-7">Estadísticas públicas</h2>
            <p className="mt-1 text-sm text-ink-muted">Datos agregados y anónimos de toda la comunidad.</p>
          </div>
          <ButtonLink href="/estadisticas" variant="ghost">Ver más estadísticas</ButtonLink>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Viajes registrados" value={hasStats ? formatNumber(stats.trips_count) : "—"} icon={<Bike className="size-5" />} />
          <StatTile label="CO₂ evitado" value={hasStats ? formatCo2(stats.co2_saved_g) : "—"} icon={<Leaf className="size-5" />} />
          <StatTile label="Distancia sostenible" value={hasStats ? formatDistance(stats.distance_m) : "—"} icon={<MapPinned className="size-5" />} accent="blue" />
          <StatTile label="CO₂ emitido" value={hasStats ? formatCo2(stats.co2_emitted_g) : "—"} hint="Por los medios que sí emiten (autobús, auto compartido…)" icon={<Trees className="size-5" />} accent="teal" />
        </div>
        <div className="mt-6">
          {stats ? (
            <ModeShareChart data={stats.by_mode} description="Viajes por medio de transporte, toda la comunidad" />
          ) : (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-muted">Las estadísticas no están disponibles en este momento.</p>
          )}
        </div>
      </section>

      <section className="bg-brand-strong text-on-brand">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-[22px] font-bold leading-7 text-brand-soft">Cada trayecto cuenta</h2>
            <p className="mt-2 max-w-xl text-brand-soft/80">Únete y descubre cuánto CO₂ evitas al mes. Usa la misma cuenta en la web y en Android.</p>
          </div>
          <div className="flex gap-3">
            <ButtonLink href="/registro" size="lg">Crear cuenta</ButtonLink>
            <ButtonLink href="/movilidad-sostenible" size="lg" variant="secondary">Saber más</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
