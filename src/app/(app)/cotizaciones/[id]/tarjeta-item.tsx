"use client";

import { useState } from "react";
import { Check, CircleHelp, Minus, Plus, Ruler, Trash2, TriangleAlert } from "lucide-react";
import { Boton, Placa } from "@/components/ui/base";
import { articulos } from "@/mock/catalogo";
import type { ItemCotizacion } from "@/mock/comercial";
import { clp, cn } from "@/lib/formato";

const borde = { ok: "border-l-musgo", por_confirmar: "border-l-ambar", a_pedido: "border-l-pizarra" };

export function TarjetaItem({ item, n, activo, bloqueado, onActivar, onCambiar, onEliminar }: {
  item: ItemCotizacion;
  n: number;
  activo: boolean;
  bloqueado: boolean;
  onActivar: (id: string | null) => void;
  onCambiar: (cambio: Partial<ItemCotizacion>) => void;
  onEliminar: () => void;
}) {
  const [precio, setPrecio] = useState("");
  const [codigo, setCodigo] = useState("");

  return (
    <article
      onMouseEnter={() => onActivar(item.id)}
      onMouseLeave={() => onActivar(null)}
      className={cn(
        "relative rounded-md border border-l-[3px] border-linea bg-lamina p-4 transition-shadow",
        borde[item.estado],
        activo && "shadow-[0_0_0_2px_var(--tinta)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tinta font-mono text-[11px] font-semibold text-lamina">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.estado === "ok" && item.codigo && <Placa codigo={item.codigo} />}
            {item.estado === "por_confirmar" && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ambar"><CircleHelp className="h-3.5 w-3.5" /> Por confirmar</span>
            )}
            {item.estado === "a_pedido" && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-pizarra"><Ruler className="h-3.5 w-3.5" /> A pedido</span>
            )}
          </div>
          <p className="mt-1.5 font-medium">{item.descripcion}</p>
          {item.duda && item.estado !== "ok" && <p className="mt-1 text-sm text-tinta-suave">{item.duda}</p>}
          {item.avisoStock && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded bg-ambar-velo px-2 py-0.5 text-xs text-ambar">
              <TriangleAlert className="h-3 w-3" /> {item.avisoStock}
            </p>
          )}

          {item.estado === "por_confirmar" && !bloqueado && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select value={codigo} onChange={(e) => setCodigo(e.target.value)} aria-label="Elegir artículo del catálogo"
                className="h-9 min-w-56 rounded-md border border-linea-fuerte bg-lamina px-2 text-sm focus:border-tinta focus:outline-none">
                <option value="">Elegir artículo del catálogo…</option>
                {articulos.map((a) => <option key={a.codigo} value={a.codigo}>{a.codigo} · {a.modelo}</option>)}
              </select>
              <Boton disabled={!codigo} onClick={() => {
                const a = articulos.find((x) => x.codigo === codigo)!;
                onCambiar({ estado: "ok", codigo, descripcion: `${a.modelo} · ${a.ancho} × ${a.alto.toFixed(2).replace(".", ",")} m`, precioUnitario: Math.round(a.precioNeto * 1.15), duda: undefined });
              }}><Check className="h-4 w-4" /> Usar</Boton>
              <Boton variante="fantasma" onClick={onEliminar}><Trash2 className="h-4 w-4" /> Quitar</Boton>
            </div>
          )}

          {item.estado === "a_pedido" && item.referencia && !bloqueado && (
            <div className="mt-3 rounded-md bg-pizarra-velo/60 p-3 text-sm">
              <p className="text-tinta-suave">
                Referencia: <Placa codigo={item.referencia.codigo} /> {item.referencia.medida} · <strong className="text-tinta">{clp(item.referencia.precio)}</strong> c/u
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input inputMode="numeric" placeholder="Precio unitario neto" value={precio}
                  onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))}
                  className="h-9 w-48 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm tabular-nums focus:border-tinta focus:outline-none" />
                <Boton onClick={() => setPrecio(String(item.referencia!.precio))} variante="fantasma">Usar referencia</Boton>
                <Boton disabled={!precio} onClick={() => onCambiar({ estado: "ok", precioUnitario: Number(precio), duda: undefined, descripcion: `${item.descripcion.replace(" (fuera de grilla)", "")} · a pedido` })}>
                  <Check className="h-4 w-4" /> Fijar precio
                </Boton>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center rounded-md border border-linea">
            <button aria-label="Restar" disabled={bloqueado || item.cantidad <= 1} onClick={() => onCambiar({ cantidad: item.cantidad - 1 })}
              className="grid h-7 w-7 place-items-center text-tinta-suave hover:text-tinta disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-8 text-center font-mono text-sm tabular-nums">{item.cantidad}</span>
            <button aria-label="Sumar" disabled={bloqueado} onClick={() => onCambiar({ cantidad: item.cantidad + 1 })}
              className="grid h-7 w-7 place-items-center text-tinta-suave hover:text-tinta disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          {item.precioUnitario ? (
            <div className="text-right tabular-nums">
              <p className="text-xs text-tinta-tenue">{clp(item.precioUnitario)} c/u</p>
              <p className="font-display text-lg font-medium">{clp(item.precioUnitario * item.cantidad)}</p>
            </div>
          ) : (
            <p className="text-sm text-tinta-tenue">sin precio</p>
          )}
        </div>
      </div>
    </article>
  );
}
