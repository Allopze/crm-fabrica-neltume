"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";

/** Mínimo de stock editable (config.editar). Vacío = sin mínimo. */
export function EditarMinimo({ codigo, minimo, csrf }: { codigo: string; minimo: number | null; csrf: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(minimo === null ? "" : String(minimo));
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();

  if (!editando) {
    return <>{minimo ?? "—"} <button onClick={() => setEditando(true)} className="ml-1 inline-flex min-h-9 items-center text-rauli hover:underline pointer-coarse:min-h-11">editar<span className="sr-only"> mínimo de stock</span></button></>;
  }
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <input autoFocus inputMode="numeric" aria-label="Mínimo de stock" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
        className="h-9 w-16 rounded border border-linea-fuerte bg-lamina px-2 text-right font-mono text-sm pointer-coarse:h-11" />
      <button disabled={pendiente} className="inline-flex min-h-9 items-center text-sm text-musgo pointer-coarse:min-h-11" onClick={() => iniciar(async () => {
        try {
          await pedir("PATCH", `/api/v1/articulos/${encodeURIComponent(codigo)}`, { csrf, cuerpo: { stockMinimo: valor === "" ? null : Number(valor) } });
          setEditando(false);
          router.refresh();
        } catch (e) {
          setError(e);
        }
      })}>Guardar</button>
      {error ? <ErrorAccion error={error} className="basis-full px-2 py-1 text-xs" /> : null}
    </div>
  );
}
