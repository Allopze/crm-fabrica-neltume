"use client";

import { useState } from "react";
import { Copy, TriangleAlert } from "lucide-react";
import { ErrorApi } from "@/lib/api-cliente";
import { cn } from "@/lib/formato";

/**
 * Error de una acción (UX §2). El código para soporte solo aparece en errores inesperados (del servidor): en uno de
 * datos o credenciales (4xx) basta el mensaje, que ya dice qué corregir.
 */
export function ErrorAccion({ error, className }: { error: unknown; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  if (!error) return null;
  const mensaje = error instanceof Error ? error.message : String(error);
  const inesperado = error instanceof ErrorApi && !(error.estado !== undefined && error.estado >= 400 && error.estado < 500);
  const correlacion = inesperado ? error.correlacionId : undefined;

  return (
    <div role="alert" className={cn("rounded-md border border-error/25 bg-error-velo px-4 py-3 text-sm text-error", className)}>
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{mensaje}</span>
      </p>
      {correlacion && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span>Código para soporte:</span>
          <code className="rounded bg-lamina/60 px-1.5 py-0.5 font-mono">{correlacion}</code>
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 underline-offset-2 hover:underline pointer-coarse:min-h-11"
            onClick={() => navigator.clipboard.writeText(correlacion).then(() => setCopiado(true), () => setCopiado(false))}
          >
            <Copy className="h-3.5 w-3.5" /> {copiado ? "Copiado" : "Copiar"}
          </button>
        </p>
      )}
    </div>
  );
}
