import type { Metadata } from "next";
import { BotonLink } from "@/components/ui/base";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Página no encontrada" };

// Rutas que no existen fuera del área con sesión (las de dentro usan (app)/not-found.tsx, con la barra lateral).
export default function NoExiste() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="entrada flex flex-col items-center gap-4 text-center">
        <Logo className="h-20 w-auto text-tinta" />
        <div aria-hidden className="regla w-24 opacity-70" />
        <h1 className="font-display text-3xl font-medium tracking-tight text-balance">Esta puerta no lleva a ninguna parte</h1>
        <p className="max-w-sm text-sm text-tinta-suave">La dirección no existe. Revísala o vuelve al panel.</p>
        <BotonLink href="/" variante="primario">Ir al panel</BotonLink>
      </div>
    </main>
  );
}
