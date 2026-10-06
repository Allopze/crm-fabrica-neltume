"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/formato";
import type { ItemDetalle } from "./tipos";

const estiloMarca: Record<string, string> = {
  ok: "decoration-musgo bg-musgo-velo/70",
  por_confirmar: "decoration-ambar bg-ambar-velo",
  a_pedido: "decoration-pizarra bg-pizarra-velo",
};

// Mismos patrones que la redacción previa al LLM (src/ai/redaccion.ts), para mostrar qué se ocultó.
const PATRON_PERSONAL = /(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b\d{1,2}\.?\d{3}\.?\d{3}\s?-\s?[\dkK]\b|(?:\+?56[\s.-]?)?\b9[\s.-]?\d{4}[\s.-]?\d{4}\b)/g;

interface Tramo { inicio: number; fin: number; tipo: "item" | "personal"; item?: ItemDetalle; n?: number }

/** Texto original con cada fragmento subrayado y numerado según el ítem que generó (UX §3). Todo se muestra escapado. */
export function TextoMarcado({ texto, items, activo, onActivar, vistaIA }: {
  texto: string; items: ItemDetalle[]; activo: string | null; onActivar: (id: string | null) => void; vistaIA: boolean;
}) {
  const tramos: Tramo[] = [];
  items.forEach((it, i) => {
    const pos = it.textoFuente ? texto.indexOf(it.textoFuente) : -1;
    if (pos >= 0) tramos.push({ inicio: pos, fin: pos + it.textoFuente!.length, tipo: "item", item: it, n: i + 1 });
  });
  for (const m of texto.matchAll(PATRON_PERSONAL)) tramos.push({ inicio: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, tipo: "personal" });
  tramos.sort((a, b) => a.inicio - b.inicio);

  const partes: ReactNode[] = [];
  let cursor = 0;
  tramos.forEach((t, k) => {
    if (t.inicio < cursor) return;
    partes.push(texto.slice(cursor, t.inicio));
    const fragmento = texto.slice(t.inicio, t.fin);
    if (t.tipo === "item" && t.item) {
      const it = t.item;
      partes.push(
        <mark key={k} onMouseEnter={() => onActivar(it.id)} onMouseLeave={() => onActivar(null)}
          className={cn("cursor-default rounded-[3px] px-0.5 text-tinta underline decoration-2 underline-offset-4 transition-shadow", estiloMarca[it.estadoItem], activo === it.id && "shadow-[0_0_0_2px_var(--tinta)]")}>
          {fragmento}<sup className="ml-0.5 font-mono text-[10px] font-semibold">{t.n}</sup>
        </mark>,
      );
    } else {
      partes.push(vistaIA
        ? <span key={k} className="rounded-[3px] bg-tinta px-1 font-mono text-[12px] text-lamina">[DATO OCULTO]</span>
        : <span key={k} className="border-b border-dashed border-tinta-tenue" title="Se oculta antes de enviar a la IA">{fragmento}</span>);
    }
    cursor = t.fin;
  });
  partes.push(texto.slice(cursor));
  return <p className="whitespace-pre-wrap font-display text-[1.2rem] leading-[1.85] text-tinta-suave [font-variation-settings:'opsz'_24]">{partes}</p>;
}
