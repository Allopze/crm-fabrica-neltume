import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

export const metadata: Metadata = { title: "Ingresar" };

const muestras = [
  { nombre: "Pino Oregón", css: "var(--pino-oregon)" },
  { nombre: "Lenga", css: "var(--lenga)" },
  { nombre: "Mara", css: "var(--mara)" },
  { nombre: "Raulí", css: "var(--rauli-madera)" },
];

export default function LoginPage() {
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
        <form className="entrada w-full max-w-sm" action="/">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-rauli">Acceso interno</p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Ingresar</h1>
          <div className="regla mt-6 mb-8" aria-hidden />

          <label className="block text-sm font-medium" htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="username" defaultValue="paula@neltume.cl"
            className="mt-1.5 h-11 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-[15px] focus:border-tinta focus:outline-none" />

          <label className="mt-5 block text-sm font-medium" htmlFor="clave">Contraseña</label>
          <input id="clave" type="password" autoComplete="current-password" defaultValue="••••••••••"
            className="mt-1.5 h-11 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-[15px] focus:border-tinta focus:outline-none" />

          <p className="mt-3 hidden rounded-md border border-error/25 bg-error-velo px-3 py-2 text-sm text-error" role="alert">
            Correo o contraseña incorrectos.
          </p>

          <button type="submit"
            className="mt-7 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-rauli text-[15px] font-medium text-lamina shadow-[inset_0_-2px_0_rgb(0_0_0/0.2)] hover:bg-rauli-hondo">
            <Lock className="h-4 w-4" /> Ingresar
          </button>
          <p className="mt-6 text-center text-xs text-tinta-tenue">
            Protegido por Cloudflare Access. ¿Problemas? <Link href="/" className="underline">Contacta a administración</Link>.
          </p>
        </form>
      </section>
    </div>
  );
}
