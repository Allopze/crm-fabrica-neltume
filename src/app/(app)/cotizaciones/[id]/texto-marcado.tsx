"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/formato";
import type { EstadoItem, ItemCotizacion } from "@/mock/comercial";

const estiloMarca: Record<EstadoItem, string> = {
  ok: "decoration-musgo bg-musgo-velo/70",
  por_confirmar: "decoration-ambar bg-ambar-velo",
  a_pedido: "decoration-pizarra bg-pizarra-velo",
};

const PATRON_PERSONAL = /(\+56\s?9\s?\d{4}\s?\d{4}|\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b|[\w.]+@[\w.]+\.\w+)/g;

interface Tramo { inicio: number; fin: number; tipo: "item" | "alerta" | "personal"; item?: ItemCotizacion; n?: number }

/** Texto original con cada fragmento subrayado y numerado según el ítem que generó. */
export function TextoMarcado({ texto, items, alertaFragmento, activo, onActivar, vistaIA }: {
  texto: string;
  items: ItemCotizacion[];
  alertaFragmento?: string;
  activo: string | null;
  onActivar: (id: string | null) => void;
  vistaIA: boolean;
}) {
  const tramos: Tramo[] = [];
  items.forEach((it, i) => {
    const pos = texto.indexOf(it.fuente);
    if (pos >= 0) tramos.push({ inicio: pos, fin: pos + it.fuente.length, tipo: "item", item: it, n: i + 1 });
  });
  if (alertaFragmento) {
    const pos = texto.indexOf(alertaFragmento);
    if (pos >= 0) tramos.push({ inicio: pos, fin: pos + alertaFragmento.length, tipo: "alerta" });
  }
  for (const m of texto.matchAll(PATRON_PERSONAL)) {
    tramos.push({ inicio: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, tipo: "personal" });
  }
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
        <mark
          key={k}
          onMouseEnter={() => onActivar(it.id)}
          onMouseLeave={() => onActivar(null)}
          className={cn(
            "cursor-default rounded-[3px] px-0.5 text-tinta underline decoration-2 underline-offset-4 transition-shadow",
            estiloMarca[it.estado],
            activo === it.id && "shadow-[0_0_0_2px_var(--tinta)]",
          )}
        >
          {fragmento}
          <sup className="ml-0.5 font-mono text-[10px] font-semibold not-italic">{t.n}</sup>
        </mark>,
      );
    } else if (t.tipo === "alerta") {
      partes.push(
        <mark key={k} className="rounded-[3px] bg-error-velo px-0.5 text-error line-through decoration-error/60">{fragmento}</mark>,
      );
    } else {
      partes.push(
        vistaIA ? (
          <span key={k} className="rounded-[3px] bg-tinta px-1 font-mono text-[12px] text-lamina">[DATO OCULTO]</span>
        ) : (
          <span key={k} className="rounded-[3px] border-b border-dashed border-tinta-tenue" title="Se oculta antes de enviar a la IA">{fragmento}</span>
        ),
      );
    }
    cursor = t.fin;
  });
  partes.push(texto.slice(cursor));

  return <p className="font-display text-[1.2rem] leading-[1.85] text-tinta-suave [font-variation-settings:'opsz'_24]">{partes}</p>;
}
