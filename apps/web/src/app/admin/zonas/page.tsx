import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingCard } from "@/components/common/PendingCard";

export const metadata: Metadata = { title: "Zonas" };

export default function Page() {
  return (
    <>
      <PageHeader title="Zonas" description="Zonas de movilidad de la zona metropolitana." />
      <PendingCard title="Zonas" feature="Gestión de zonas" />
    </>
  );
}
