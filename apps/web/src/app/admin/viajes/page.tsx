import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingCard } from "@/components/common/PendingCard";

export const metadata: Metadata = { title: "Viajes" };

export default function Page() {
  return (
    <>
      <PageHeader title="Viajes" description="Viajes de toda la plataforma (sin trazas individuales)." />
      <PendingCard title="Viajes" feature="Listado administrativo de viajes" />
    </>
  );
}
