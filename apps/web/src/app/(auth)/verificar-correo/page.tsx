import type { Metadata } from "next";
import { VerifyEmailFlow } from "@/components/auth/VerifyEmailFlow";

// El token viaja en la URL del correo: no se envía como Referer ni se indexa.
export const metadata: Metadata = { title: "Verificar correo", referrer: "no-referrer", robots: { index: false, follow: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const t = (await searchParams).token;
  return <VerifyEmailFlow token={Array.isArray(t) ? t[0] : t} />;
}
