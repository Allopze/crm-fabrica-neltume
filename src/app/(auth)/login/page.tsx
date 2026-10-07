import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { MADERAS_LOGIN, Tablon } from "@/components/ui/tablon";
import { sesionActual } from "@/domain/auth/servidor";
import { MARCA } from "@/lib/marca";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Ingresar" };


export default async function LoginPage() {
  if (await sesionActual()) redirect("/");
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Lado del taller: las cuatro maderas como tablones verticales */}
      <section aria-hidden className="veta relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 grid grid-cols-4 gap-[2px] bg-[#1a120c]">
          {MADERAS_LOGIN.map((m, i) => (
            <div key={m.id} className="entrada relative overflow-hidden shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]" style={{ animationDelay: `${i * 0.08}s` }}>
              <Tablon m={m} className="absolute inset-0 h-full w-full" />
              <span className="absolute bottom-8 left-1/2 -translate-x-1/2 rotate-180 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.3em] text-white/85 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)] [writing-mode:vertical-rl]">
                {m.nombre}
              </span>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-[var(--bosque)] via-[var(--bosque)]/80 to-transparent p-12 pb-40">
          <Logo className="h-24 w-auto text-bosque-tinta" />
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-bosque-tinta/75">{MARCA.area}</p>
          <p className="mt-6 max-w-md font-display text-5xl leading-[1.05] font-medium text-bosque-tinta [font-variation-settings:'SOFT'_80]">
            Puertas de madera nativa, cotizadas en minutos.
          </p>
        </div>
      </section>

      <main className="flex items-center justify-center px-6 py-16">
        <FormularioLogin />
      </main>
    </div>
  );
}
