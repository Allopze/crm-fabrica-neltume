import { BotonLink } from "@/components/ui/base";

// Rutas que no existen fuera del área con sesión (las de dentro usan (app)/not-found.tsx, con la barra lateral).
export default function NoExiste() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div aria-hidden className="regla w-24 opacity-70" />
        <h1 className="font-display text-2xl">Esta página no existe</h1>
        <p className="max-w-sm text-sm text-tinta-suave">Revisa la dirección o vuelve al inicio.</p>
        <BotonLink href="/">Ir al panel</BotonLink>
      </div>
    </main>
  );
}
