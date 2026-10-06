"use client";

import { useState } from "react";
import { Check, CircleHelp, Minus, Plus, Ruler, Trash2, TriangleAlert } from "lucide-react";
import { Boton, Placa } from "@/components/ui/base";
import { clp, cn } from "@/lib/formato";
import { SelectorArticulo } from "./selector-articulo";
import type { ItemDetalle } from "./tipos";

const borde: Record<string, string> = { ok: "border-l-musgo", por_confirmar: "border-l-ambar", a_pedido: "border-l-pizarra" };

/** Cifra al inicio del fragmento del cliente ("3 puertas…" → 3), para avisar si no coincide con la cantidad (UX §3). */
function cifraDelTexto(t: string | null): number | null {
  const m = t?.match(/^\s*(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
}

export interface AccionesItem {
  resolver: (codigo: string) => void;
  fijarPrecio: (precio: number) => void;
  cantidad: (n: number) => void;
  quitar: () => void;
}

export function TarjetaItem({ item, n, activo, bloqueado, listaVersion, onActivar, acciones }: {
  item: ItemDetalle; n: number; activo: boolean; bloqueado: boolean; listaVersion: number | null;
  onActivar: (id: string | null) => void; acciones: AccionesItem;
}) {
  const [precio, setPrecio] = useState("");
  const cifra = cifraDelTexto(item.textoFuente);
  const distinta = cifra !== null && cifra !== item.cantidad;

  return (
    <article onMouseEnter={() => onActivar(item.id)} onMouseLeave={() => onActivar(null)} aria-label={`Ítem ${n}`}
      className={cn("relative rounded-md border border-l-[3px] border-linea bg-lamina p-4 transition-shadow", borde[item.estadoItem], activo && "shadow-[0_0_0_2px_var(--tinta)]")}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tinta font-mono text-[11px] font-semibold text-lamina">{n}</span>
        <div className="min-w-0 flex-1">
          {item.estadoItem === "por_confirmar" && <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ambar"><CircleHelp className="h-3.5 w-3.5" /> Por confirmar</span>}
          {item.estadoItem === "a_pedido" && <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-pizarra"><Ruler className="h-3.5 w-3.5" /> A pedido</span>}
          {item.estadoItem === "ok" && item.fijadoPor && <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-pizarra"><Ruler className="h-3.5 w-3.5" /> A pedido · precio fijado</span>}
          <p className="mt-1 font-medium">{item.descripcion}</p>
          {item.estadoItem !== "ok" && item.textoFuente && <p className="mt-0.5 text-sm text-tinta-tenue">Pedido: «{item.textoFuente}»</p>}
          {item.duda && item.estadoItem !== "ok" && <p className="mt-1 text-sm text-tinta-suave">{item.duda}</p>}
          {item.avisoStock && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded bg-ambar-velo px-2 py-0.5 text-xs text-ambar"><TriangleAlert className="h-3 w-3" /> {item.avisoStock}</p>
          )}
          {distinta && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded bg-error-velo px-2 py-0.5 text-xs text-error"><TriangleAlert className="h-3 w-3" /> El texto dice {cifra}; revisa la cantidad.</p>
          )}

          {item.estadoItem === "por_confirmar" && !bloqueado && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SelectorArticulo version={listaVersion} onElegir={acciones.resolver} etiqueta={`Elegir artículo para el ítem ${n}`} />
              <Boton variante="fantasma" onClick={acciones.quitar}><Trash2 className="h-4 w-4" /> Quitar</Boton>
            </div>
          )}

          {item.estadoItem === "a_pedido" && !bloqueado && (
            <div className="mt-3 rounded-md bg-pizarra-velo/60 p-3 text-sm">
              {item.referenciaCodigo && item.precioReferencia !== null && (
                <p className="text-tinta-suave">Referencia: <Placa codigo={item.referenciaCodigo} /> · <strong className="text-tinta">{clp(Number(item.precioReferencia))}</strong> c/u (rango y altura superiores)</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <input inputMode="numeric" placeholder="Precio unitario neto" aria-label={`Precio unitario del ítem ${n}`} value={precio}
                  onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))}
                  className="h-9 w-48 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm tabular-nums focus:border-tinta focus:outline-none" />
                {item.precioReferencia !== null && <Boton variante="fantasma" onClick={() => setPrecio(String(item.precioReferencia))}>Usar referencia</Boton>}
                <Boton disabled={!precio} onClick={() => acciones.fijarPrecio(Number(precio))}><Check className="h-4 w-4" /> Fijar precio</Boton>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center rounded-md border border-linea">
            <button aria-label="Restar" disabled={bloqueado || item.cantidad <= 1} onClick={() => acciones.cantidad(item.cantidad - 1)}
              className="grid h-7 w-7 place-items-center text-tinta-suave hover:text-tinta disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-8 text-center font-mono text-sm tabular-nums" aria-label="Cantidad">{item.cantidad}</span>
            <button aria-label="Sumar" disabled={bloqueado} onClick={() => acciones.cantidad(item.cantidad + 1)}
              className="grid h-7 w-7 place-items-center text-tinta-suave hover:text-tinta disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          {item.precioUnitario !== null ? (
            <div className="text-right tabular-nums">
              <p className="text-xs text-tinta-tenue">{clp(Number(item.precioUnitario))} c/u</p>
              <p className="font-display text-lg font-medium">{clp(Number(item.totalLinea))}</p>
            </div>
          ) : <p className="text-sm text-tinta-tenue">sin precio</p>}
          {item.estadoItem === "ok" && !bloqueado && (
            <button onClick={acciones.quitar} aria-label={`Quitar ítem ${n}`} className="text-tinta-tenue hover:text-error"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      </div>
    </article>
  );
}
