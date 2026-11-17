import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { colors } from "@ecomove/shared";
import { siteConfig } from "@/lib/site";
import { themeCss } from "./theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} · ${siteConfig.slogan}`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: ["movilidad sostenible", "Querétaro", "CO2", "bicicleta", "transporte público", "huella de carbono"],
  openGraph: { type: "website", locale: siteConfig.locale, siteName: siteConfig.name, title: siteConfig.name, description: siteConfig.description, url: "/" },
  twitter: { card: "summary_large_image", title: siteConfig.name, description: siteConfig.description },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: colors.light.primary,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={inter.variable}>
      <head>
        {/* Variables de diseño de @ecomove/shared (contenido estático generado en el servidor). */}
        <style id="ecomove-theme" dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className="min-h-dvh bg-subtle font-sans text-ink">{children}</body>
    </html>
  );
}
