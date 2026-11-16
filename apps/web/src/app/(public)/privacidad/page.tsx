import type { Metadata } from "next";

export const metadata: Metadata = { title: "Aviso de privacidad", alternates: { canonical: "/privacidad" } };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-[22px] font-bold leading-7">Aviso de privacidad (resumen)</h1>
      <p className="mt-2 text-sm text-ink-muted">Versión preliminar. El aviso completo conforme a la LFPDPPP se publicará antes de la puesta en producción.</p>
      <div className="mt-6 space-y-4 text-ink-muted">
        <p><strong className="text-ink">Qué datos tratamos.</strong> Nombre, correo electrónico y los viajes que registras (medio, horario y recorrido GPS).</p>
        <p><strong className="text-ink">Para qué.</strong> Calcular tus estadísticas y el CO₂ evitado, y generar indicadores agregados y anónimos de movilidad para la ciudad.</p>
        <p><strong className="text-ink">Quién los ve.</strong> Tus recorridos solo los ves tú. La administración consulta agregados, nunca trazas individuales.</p>
        <p><strong className="text-ink">Tus derechos.</strong> Puedes consultar, corregir o eliminar tus datos (derechos ARCO).</p>
      </div>
    </article>
  );
}
