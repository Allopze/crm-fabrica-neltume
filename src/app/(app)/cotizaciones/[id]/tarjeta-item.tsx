"use client";

import { useState } from "react";
import { Check, CircleHelp, Minus, Package, Plus, Ruler, TriangleAlert } from "lucide-react";
import { Boton, Placa } from "@/components/ui/base";
import { ConfirmarAccion } from "@/components/ui/confirmar-accion";
import { LineaMedida } from "@/components/ui/linea-medida";
import { clp, cn } from "@/lib/formato";
import { SelectorArticulo } from "./selector-articulo";
import type { ItemDetalle } from "./tipos";

// El estado lo dicen la etiqueta y el texto; el borde completo solo acompaña (sin franja lateral).
const borde: Record<string, string> = { ok: "border-linea", por_confirmar: "border-ambar/45 bg-ambar-velo/25", a_pedido: "border-pizarra/35" };
const CANTIDAD_MAX = 500;

/** Cantidad escribible entre los botones: Enter o salir del campo guarda, Esc vuelve al valor guardado. */
function CampoCantidad({ valor, n, deshabilitado, onCambiar }: { valor: number; n: number; deshabilitado: boolean; onCambiar: (n: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  const [base, setBase] = useState(valor);
  if (valor !== base) { setBase(valor); setTexto(String(valor)); }
  const guardar = () => {
    const nuevo = Number(texto);
    if (Number.isInteger(nuevo) && nuevo >= 1 && nuevo <= CANTIDAD_MAX && nuevo !== valor) onCambiar(nuevo);
    else setTexto(String(valor));
  };
  return (
    <input inputMode="numeric" aria-label={`Cantidad del ítem ${n}`} value={texto} disabled={deshabilitado}
      onChange={(e) => setTexto(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={guardar}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } else if (e.key === "Escape") setTexto(String(valor)); }}
      className="h-9 w-11 border-x border-linea bg-transparent text-center font-mono text-sm tabular-nums focus:bg-lamina pointer-coarse:h-11 disabled:opacity-60" />
  );
}

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

export function TarjetaItem({ item, n, activo, bloqueado, soloLectura, listaVersion, onActivar, acciones }: {
  item: ItemDetalle; n: number; activo: boolean; bloqueado: boolean; soloLectura: boolean; listaVersion: number | null;
  onActivar: (id: string | null) => void; acciones: AccionesItem;
}) {
  const [precio, setPrecio] = useState("");
  const cifra = cifraDelTexto(item.textoFuente);
  const distinta = cifra !== null && cifra !== item.cantidad;

  return (
    <article onMouseEnter={() => onActivar(item.id)} onMouseLeave={() => onActivar(null)}
      onFocus={() => onActivar(item.id)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onActivar(null); }} aria-label={`Ítem ${n}`}
      className={cn("relative rounded-md border bg-lamina p-4 transition-shadow", borde[item.estadoItem], activo && "shadow-[0_0_0_2px_var(--tinta)]")}>
      {/* En el celular la descripción va a lo ancho y la cantidad y el precio pasan a una fila debajo. */}
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tinta font-mono text-[11px] font-semibold text-lamina">{n}</span>
        <div className="min-w-0 flex-1 basis-[calc(100%-2.25rem)] sm:basis-auto">
          {item.estadoItem === "por_confirmar" && <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ambar"><CircleHelp className="h-3.5 w-3.5" /> Por confirmar</span>}
          {item.estadoItem === "a_pedido" && <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-pizarra"><Ruler className="h-3.5 w-3.5" /> A pedido</span>}
          {item.estadoItem === "ok" && item.fijadoPor && <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-pizarra"><Ruler className="h-3.5 w-3.5" /> A pedido · precio fijado</span>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            {item.codigo && item.estadoItem === "ok" && <Placa codigo={item.codigo} />}<span className="text-pretty">{item.descripcion}</span>
          </p>
          <LineaMedida titulo={item.descripcion} medida={item.medidaSolicitada} como="p" />
          {item.estadoItem !== "ok" && item.textoFuente && <p className="mt-0.5 text-sm text-tinta-tenue">Pedido: «{item.textoFuente}»</p>}
          {item.duda && item.estadoItem !== "ok" && <p className="mt-1 text-sm text-tinta-suave">{item.duda}</p>}
          {item.avisoStock && !soloLectura && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-tinta-suave"><Package className="h-3.5 w-3.5 text-tinta-tenue" /> {item.avisoStock}</p>
          )}
          {distinta && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded bg-error-velo px-2 py-1 text-xs text-error"><TriangleAlert className="h-3 w-3" /> El texto dice {cifra}; revisa la cantidad.</p>
          )}

          {item.estadoItem === "por_confirmar" && !bloqueado && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SelectorArticulo version={listaVersion} onElegir={acciones.resolver} etiqueta={`Elegir artículo para el ítem ${n}`} />
              <ConfirmarAccion etiqueta="Quitar" texto="Quitar" titulo="¿Quitar este ítem?" onConfirmar={async () => acciones.quitar()} />
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
                  className="h-9 w-full max-w-48 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm tabular-nums focus:border-tinta focus:outline-none" />
                {item.precioReferencia !== null && <Boton variante="fantasma" onClick={() => setPrecio(String(item.precioReferencia))}>Usar referencia</Boton>}
                <Boton disabled={!precio} onClick={() => acciones.fijarPrecio(Number(precio))}><Check className="h-4 w-4" /> Fijar precio</Boton>
              </div>
            </div>
          )}
        </div>

        <div className="flex w-full shrink-0 items-center justify-between gap-1.5 pl-9 sm:w-auto sm:flex-col sm:items-end sm:pl-0">
          <div className="flex items-center gap-1">
            {soloLectura ? (
              <p className="text-sm text-tinta-suave">Cantidad <strong className="font-mono text-tinta tabular-nums" aria-label={`Cantidad del ítem ${n}`}>{item.cantidad}</strong></p>
            ) : (
              <div className="flex items-center rounded-md border border-linea">
                <button type="button" aria-label={`Restar uno al ítem ${n}`} disabled={bloqueado || item.cantidad <= 1} onClick={() => acciones.cantidad(item.cantidad - 1)}
                  className="grid h-9 w-9 place-items-center pointer-coarse:h-11 pointer-coarse:w-11 text-tinta-suave hover:text-tinta disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
                <CampoCantidad valor={item.cantidad} n={n} deshabilitado={bloqueado} onCambiar={acciones.cantidad} />
                <button type="button" aria-label={`Sumar uno al ítem ${n}`} disabled={bloqueado || item.cantidad >= CANTIDAD_MAX} onClick={() => acciones.cantidad(item.cantidad + 1)}
                  className="grid h-9 w-9 place-items-center pointer-coarse:h-11 pointer-coarse:w-11 text-tinta-suave hover:text-tinta disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {item.estadoItem === "ok" && !bloqueado && (
              <ConfirmarAccion etiqueta={`Quitar ítem ${n}`} onConfirmar={async () => acciones.quitar()} className="-mr-2" />
            )}
          </div>
          {item.precioUnitario !== null ? (
            <div className="text-right tabular-nums">
              <p className="text-xs text-tinta-tenue">{clp(Number(item.precioUnitario))} c/u</p>
              <p className="font-display text-lg font-medium">{clp(Number(item.totalLinea))}</p>
            </div>
          ) : <p className="text-sm text-tinta-tenue">sin precio</p>}
        </div>
      </div>
    </article>
  );
}
