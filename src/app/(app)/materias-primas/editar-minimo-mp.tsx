"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { pedir } from "@/lib/api-cliente";
import { numero } from "@/lib/formato";

/** Mínimo de reposición editable (config.editar, REQ-MP-6.2). Acepta decimales con coma; vacío = sin mínimo. Enter guarda, Esc cancela. */
export function EditarMinimoMp({ id, nombre, minimo, csrf }: { id: string; nombre: string; minimo: number | null; csrf: string }) {
  const router = useRouter();
  const inicial = minimo === null ? "" : String(minimo).replace(".", ",");
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const cancelar = () => { setEditando(false); setValor(inicial); setError(null); };
  const guardar = () => iniciar(async () => {
    try {
      setError(null);
      await pedir("PATCH", `/api/v1/materias-primas/${id}/minimo`, { csrf, cuerpo: { stockMinimo: valor === "" ? null : Number(valor.replace(",", ".")) } });
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  });

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {minimo === null ? "—" : numero(minimo)}
        <button onClick={() => setEditando(true)} aria-label={`Editar mínimo de ${nombre}`} className="grid h-7 w-7 place-items-center rounded text-tinta-tenue hover:bg-papel-hundido hover:text-rauli"><Pencil className="h-3.5 w-3.5" /></button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <input autoFocus inputMode="decimal" aria-label={`Mínimo de ${nombre}`} value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,]/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } if (e.key === "Escape") cancelar(); }}
        className="h-8 w-20 rounded border border-linea-fuerte bg-lamina px-2 text-right text-sm tabular-nums focus:border-tinta focus:outline-none" />
      <button disabled={pendiente} className="text-sm font-medium text-musgo hover:underline disabled:opacity-60" onClick={guardar}>{pendiente ? "Guardando…" : "Guardar"}</button>
      <button disabled={pendiente} className="text-sm text-tinta-suave hover:underline" onClick={cancelar}>Cancelar</button>
      {error && <span role="alert" className="basis-full text-right text-xs text-error">{error}</span>}
    </span>
  );
}
