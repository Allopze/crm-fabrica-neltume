import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sesionActual } from "@/domain/auth/servidor";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Ingresar" };

const muestras = [
  { nombre: "Pino Oregón", css: "var(--pino-oregon)" },
  { nombre: "Lenga", css: "var(--lenga)" },
  { nombre: "Mara", css: "var(--mara)" },
  { nombre: "Raulí", css: "var(--rauli-madera)" },
];

export default async function LoginPage() {
  if (await sesionActual()) redirect("/");
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Lado del taller: las cuatro maderas como tablones verticales */}
      <section className="veta relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 grid grid-cols-4 gap-[3px] p-[3px] opacity-90">
          {muestras.map((m, i) => (
            <div key={m.nombre} className="swatch entrada relative" style={{ backgroundColor: m.css, animationDelay: `${i * 0.08}s` }}>
              <span className="absolute bottom-8 left-1/2 -translate-x-1/2 rotate-180 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.3em] text-white/75 [writing-mode:vertical-rl]">
                {m.nombre}
              </span>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-[var(--bosque)] via-[var(--bosque)]/80 to-transparent p-12 pb-40">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-bosque-tinta/60">Neltume · Fábrica</p>
          <p className="mt-6 max-w-md font-display text-5xl leading-[1.05] font-medium text-bosque-tinta [font-variation-settings:'SOFT'_80]">
            Puertas de madera nativa, cotizadas en minutos.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <FormularioLogin />
      </section>
    </div>
  );
}
