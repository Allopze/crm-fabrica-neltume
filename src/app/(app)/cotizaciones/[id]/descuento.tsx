"use client";

import { useState } from "react";
import { Percent } from "lucide-react";
import { Boton } from "@/components/ui/base";

/** Descuento manual con motivo (REQ-COT-7): excepción de una persona, nunca de la IA. El servidor calcula el monto. */
export function Descuento({ pct, motivo, deshabilitado, onAplicar }: {
  pct: number; motivo: string | null; deshabilitado: boolean; onAplicar: (porcentaje: number, motivo: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(pct ? String(Math.round(pct * 10_000) / 100).replace(".", ",") : "");
  const [razon, setRazon] = useState(motivo ?? "");
  const porcentaje = Number(valor.replace(",", ".") || 0);

  if (!abierto) {
    return (
      <button type="button" disabled={deshabilitado} onClick={() => setAbierto(true)} className="inline-flex items-center gap-1 text-xs text-rauli hover:underline disabled:opacity-40">
        <Percent className="h-3 w-3" /> {pct > 0 ? "Cambiar o quitar descuento" : "Aplicar descuento"}
      </button>
    );
  }
  return (
    <form aria-label="Descuento" className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); onAplicar(porcentaje, razon); setAbierto(false); }}>
      <label className="flex items-center gap-1 text-sm">
        <input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,]/g, ""))} inputMode="decimal" aria-label="Porcentaje de descuento" placeholder="0"
          className="h-8 w-16 rounded-md border border-linea-fuerte bg-lamina px-2 text-right tabular-nums" /> %
      </label>
      <input value={razon} onChange={(e) => setRazon(e.target.value)} required minLength={3} maxLength={300} aria-label="Motivo del descuento" placeholder="Motivo (obligatorio)"
        className="h-8 min-w-48 flex-1 rounded-md border border-linea-fuerte bg-lamina px-2 text-sm" />
      <Boton type="submit" disabled={deshabilitado || razon.trim().length < 3 || !(porcentaje >= 0 && porcentaje < 100)}>{porcentaje > 0 ? "Aplicar" : "Quitar"}</Boton>
      <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
    </form>
  );
}
