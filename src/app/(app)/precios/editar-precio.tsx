"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine, X } from "lucide-react";
import { pedir } from "@/lib/api-cliente";
import { clp } from "@/lib/formato";

/** Edita el precio neto de un artículo: crea una versión nueva de la lista (REQ-COT-1.1). */
export function EditarPrecio({ codigo, precioNeto, csrf }: { codigo: string; precioNeto: number; csrf: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(Math.round(precioNeto)));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-2">
        {clp(precioNeto)}
        <button aria-label={`Editar precio de ${codigo}`} onClick={() => setEditando(true)} className="text-tinta-tenue hover:text-rauli">
          <PencilLine className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus inputMode="numeric" aria-label={`Nuevo precio neto de ${codigo}`} value={valor}
        onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
        className="h-7 w-28 rounded border border-linea-fuerte bg-lamina px-2 text-right font-mono text-sm" />
      <button aria-label="Guardar" disabled={pendiente || !Number(valor)} className="text-musgo disabled:opacity-40"
        onClick={() => iniciar(async () => {
          try {
            await pedir("POST", "/api/v1/listas-precio", { csrf, idempotente: true, cuerpo: { cambios: [{ codigo, precioNeto: Number(valor) }] } });
            setEditando(false);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        })}>
        <Check className="h-4 w-4" />
      </button>
      <button aria-label="Cancelar" onClick={() => { setEditando(false); setError(null); }} className="text-tinta-tenue"><X className="h-4 w-4" /></button>
      {error && <span role="alert" className="text-xs text-error">{error}</span>}
    </span>
  );
}
