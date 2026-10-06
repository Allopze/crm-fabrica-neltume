"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/api-cliente";
import { numero } from "@/lib/formato";

/** Mínimo de reposición editable (config.editar, REQ-MP-6.2). Acepta decimales con coma; vacío = sin mínimo. */
export function EditarMinimoMp({ id, nombre, minimo, csrf }: { id: string; nombre: string; minimo: number | null; csrf: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(minimo === null ? "" : String(minimo).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!editando) {
    return <>{minimo === null ? "—" : numero(minimo)} <button onClick={() => setEditando(true)} aria-label={`Editar mínimo de ${nombre}`} className="ml-1 text-rauli hover:underline">editar</button></>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input autoFocus inputMode="decimal" aria-label={`Mínimo de ${nombre}`} value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,]/g, ""))}
        className="h-7 w-20 rounded border border-linea-fuerte bg-lamina px-2 text-right font-mono text-sm" />
      <button disabled={pendiente} className="text-sm text-musgo" onClick={() => iniciar(async () => {
        try {
          await pedir("PATCH", `/api/v1/materias-primas/${id}/minimo`, { csrf, cuerpo: { stockMinimo: valor === "" ? null : Number(valor.replace(",", ".")) } });
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
