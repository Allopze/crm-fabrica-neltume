"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine, X } from "lucide-react";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { clp } from "@/lib/formato";

/** Edita el precio neto de un artículo: crea una versión nueva de la lista (REQ-COT-1.1). */
export function EditarPrecio({ codigo, precioNeto, csrf }: { codigo: string; precioNeto: number; csrf: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(Math.round(precioNeto)));
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-2">
        {clp(precioNeto)}
        <button aria-label={`Editar precio de ${codigo}`} onClick={() => setEditando(true)} className="grid h-9 w-9 place-items-center rounded text-tinta-tenue hover:bg-papel-hundido hover:text-rauli pointer-coarse:h-11 pointer-coarse:w-11">
          <PencilLine className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <input autoFocus inputMode="numeric" aria-label={`Nuevo precio neto de ${codigo}`} value={valor}
        onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
        className="h-9 w-28 rounded border border-linea-fuerte bg-lamina px-2 text-right font-mono text-sm pointer-coarse:h-11" />
      <button aria-label="Guardar" disabled={pendiente || !Number(valor)} className="grid h-9 w-9 place-items-center rounded text-musgo hover:bg-musgo-velo disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
        onClick={() => iniciar(async () => {
          try {
            await pedir("POST", "/api/v1/listas-precio", { csrf, idempotente: true, cuerpo: { cambios: [{ codigo, precioNeto: Number(valor) }] } });
            setEditando(false);
            router.refresh();
          } catch (e) {
            setError(e);
          }
        })}>
        <Check className="h-4 w-4" />
      </button>
      <button aria-label="Cancelar" onClick={() => { setEditando(false); setError(null); }} className="grid h-9 w-9 place-items-center rounded text-tinta-tenue hover:bg-papel-hundido pointer-coarse:h-11 pointer-coarse:w-11"><X className="h-4 w-4" /></button>
      {error ? <ErrorAccion error={error} className="basis-full px-2 py-1 text-xs" /> : null}
    </div>
  );
}
