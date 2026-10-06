"use client";

import { RotateCcw } from "lucide-react";
import { Boton } from "@/components/ui/base";

// Estado "error" (UX §2): mensaje en español, acción sugerida y referencia para soporte.
export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <p className="font-display text-2xl">Algo salió mal al cargar esta pantalla</p>
      <p className="max-w-md text-sm text-tinta-suave">Tus datos no se modificaron. Intenta de nuevo; si persiste, comparte este código con soporte.</p>
      {error.digest && <code className="rounded bg-papel-hundido px-2 py-1 font-mono text-xs text-tinta-suave">{error.digest}</code>}
      <Boton onClick={reset}><RotateCcw className="h-4 w-4" /> Reintentar</Boton>
    </div>
  );
}
