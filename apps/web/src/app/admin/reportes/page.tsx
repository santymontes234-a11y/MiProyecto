import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingCard } from "@/components/common/PendingCard";

export const metadata: Metadata = { title: "Reportes ciudadanos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Reportes ciudadanos" description="Incidencias de infraestructura reportadas por la ciudadanía." />
      <PendingCard title="Reportes ciudadanos" feature="Reportes ciudadanos" />
    </>
  );
}
