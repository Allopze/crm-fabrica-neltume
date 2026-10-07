import { ChevronRight } from "lucide-react";
import { cantidad, cn, usoPorPuerta } from "@/lib/formato";

interface Linea { id: string; maderaPuerta: boolean; mp: string; unidad: string; cantidad: number }

function Fila({ l }: { l: Linea }) {
  const lectura = l.maderaPuerta ? null : usoPorPuerta(l.cantidad);
  return (
    <li className="flex flex-wrap gap-x-2">
      <span className={cn(l.maderaPuerta && "font-medium")}>{l.mp}</span>
      <span className="tabular-nums text-tinta-suave">{l.maderaPuerta ? `× ${cantidad(l.cantidad)} pulgadas del artículo` : `${cantidad(l.cantidad)} ${l.unidad}`}</span>
      {lectura && <span className="text-tinta-tenue">({lectura})</span>}
    </li>
  );
}

/** Receta compacta: la madera de la puerta a la vista y los insumos plegados, para que la tabla de modelos se pueda recorrer. */
export function LineasBom({ lineas }: { lineas: Linea[] }) {
  const madera = lineas.filter((l) => l.maderaPuerta);
  const insumos = lineas.filter((l) => !l.maderaPuerta);
  return (
    <div className="text-sm">
      {madera.length > 0 && <ul className="space-y-0.5">{madera.map((l) => <Fila key={l.id} l={l} />)}</ul>}
      {insumos.length > 0 && (
        <details className="group mt-0.5">
          <summary className="inline-flex cursor-pointer list-none items-center text-tinta-suave select-none hover:text-tinta [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="mr-1 inline h-3.5 w-3.5 -translate-y-px transition-transform group-open:rotate-90" />{insumos.length === 1 ? "1 insumo" : `${insumos.length} insumos`}
          </summary>
          <ul className="mt-1 space-y-0.5 border-l border-linea pl-3">{insumos.map((l) => <Fila key={l.id} l={l} />)}</ul>
        </details>
      )}
    </div>
  );
}
