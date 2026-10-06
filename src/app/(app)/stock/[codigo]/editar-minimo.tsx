"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/api-cliente";

/** Mínimo de stock editable (config.editar). Vacío = sin mínimo. */
export function EditarMinimo({ codigo, minimo, csrf }: { codigo: string; minimo: number | null; csrf: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(minimo === null ? "" : String(minimo));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!editando) {
    return <>{minimo ?? "—"} <button onClick={() => setEditando(true)} className="ml-1 text-rauli hover:underline">editar</button></>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input autoFocus inputMode="numeric" aria-label="Mínimo de stock" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
        className="h-7 w-16 rounded border border-linea-fuerte bg-lamina px-2 text-right font-mono text-sm" />
      <button disabled={pendiente} className="text-sm text-musgo" onClick={() => iniciar(async () => {
        try {
          await pedir("PATCH", `/api/v1/articulos/${encodeURIComponent(codigo)}`, { csrf, cuerpo: { stockMinimo: valor === "" ? null : Number(valor) } });
          setEditando(false);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        }
      })}>Guardar</button>
      {error && <span role="alert" className="text-xs text-error">{error}</span>}
    </span>
  );
}
