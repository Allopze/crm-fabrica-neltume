import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Neltume Fábrica", template: "%s · Neltume Fábrica" },
  description: "Stock, materias primas y cotizador de la fábrica de puertas Neltume.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CL"
      className={`${fraunces.variable} ${instrument.variable} ${jetbrains.variable} h-full`}
    >
      <body className="grano min-h-full bg-papel text-tinta">{children}</body>
    </html>
  );
}
