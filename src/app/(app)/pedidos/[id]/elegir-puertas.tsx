"use client";

import { Placa } from "@/components/ui/base";
import { cn } from "@/lib/formato";

export interface OpcionPuerta { codigo: string; ubicacion: string; calidad: string; observacion: string | null }
export interface GrupoDespacho { articulo: string; descripcion: string; cantidad: number; opciones: OpcionPuerta[] }

/** Primeras `cantidad` puertas de cada artículo: las que saldrían solas (las más antiguas, primero las de primera). */
export const eleccionInicial = (grupos: GrupoDespacho[]) =>
  Object.fromEntries(grupos.map((g) => [g.articulo, g.opciones.slice(0, g.cantidad).map((o) => o.codigo)]));

/** Qué puertas salen en el despacho (REQ-STK-8.3): la etiqueta de cada una queda en el registro. */
export function ElegirPuertas({ grupos, eleccion, cambiar }: {
  grupos: GrupoDespacho[]; eleccion: Record<string, string[]>; cambiar: (e: Record<string, string[]>) => void;
}) {
  return (
    <div className="mt-3 space-y-4">
      {grupos.map((g) => {
        const elegidas = eleccion[g.articulo] ?? [];
        const lleno = elegidas.length >= g.cantidad;
        return (
          <fieldset key={g.articulo} className="rounded-md border border-linea bg-lamina">
            <legend className="sr-only">Puertas de {g.articulo}</legend>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linea px-3 py-2">
              <span className="flex items-center gap-2 text-sm"><Placa codigo={g.articulo} /> <span className="text-tinta-suave">{g.descripcion}</span></span>
              <span className={cn("text-xs tabular-nums", lleno ? "text-musgo" : "text-ambar")}>{elegidas.length} de {g.cantidad} elegidas</span>
            </div>
            <ul className="max-h-64 divide-y divide-linea/70 overflow-y-auto">
              {g.opciones.map((o) => {
                const marcada = elegidas.includes(o.codigo);
                return (
                  <li key={o.codigo}>
                    <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm pointer-coarse:py-3", !marcada && lleno && "cursor-not-allowed opacity-50")}>
                      <input type="checkbox" checked={marcada} disabled={!marcada && lleno} className="accent-[var(--rauli)]"
                        onChange={(e) => cambiar({ ...eleccion, [g.articulo]: e.target.checked ? [...elegidas, o.codigo] : elegidas.filter((c) => c !== o.codigo) })} />
                      <span className="font-mono text-[13px]">{o.codigo}</span>
                      <span className="text-tinta-suave">{o.ubicacion}</span>
                      {o.calidad === "segunda" && <span className="rounded-full bg-ambar-velo px-1.5 text-xs text-ambar">de segunda</span>}
                      {o.observacion && <span className="truncate text-xs text-tinta-tenue">{o.observacion}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}
