import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import { Boton, Encabezado, Madera, Panel, Placa } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { articulos, disponible, maderas } from "@/mock/catalogo";
import { cn, metros } from "@/lib/formato";

export const metadata: Metadata = { title: "Stock de puertas" };

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

/** Barra de nivel: existencia sobre el mínimo, con la parte reservada sombreada. */
function Nivel({ existencia, reservado, minimo }: { existencia: number; reservado: number; minimo: number }) {
  const tope = Math.max(existencia, minimo, 1) * 1.25;
  const bajo = existencia - reservado < minimo;
  return (
    <div className="relative h-2 w-28 rounded-full bg-papel-hundido" aria-hidden>
      <div className={cn("absolute inset-y-0 left-0 rounded-full", bajo ? "bg-ambar" : "bg-musgo")} style={{ width: `${(existencia / tope) * 100}%` }} />
      <div className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.25)_0_2px,transparent_2px_4px)]"
        style={{ left: `${((existencia - reservado) / tope) * 100}%`, width: `${(reservado / tope) * 100}%` }} />
      <div className="absolute -top-1 -bottom-1 w-px bg-tinta" style={{ left: `${(minimo / tope) * 100}%` }} title="Mínimo" />
    </div>
  );
}

export default function StockPage() {
  return (
    <>
      <Encabezado
        antetitulo="Taller · producto terminado"
        titulo="Stock de puertas"
        descripcion="El saldo es la suma de los movimientos: nadie lo edita a mano. Para corregir, registra un ajuste con motivo."
        acciones={
          <>
            <Boton><SlidersHorizontal className="h-4 w-4" /> Ajuste</Boton>
            <Boton><ArrowUpFromLine className="h-4 w-4" /> Salida</Boton>
            <Boton variante="primario"><ArrowDownToLine className="h-4 w-4" /> Entrada</Boton>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input type="search" placeholder="Código o modelo" className={`${campo} w-56`} />
        <select className={campo} aria-label="Madera"><option>Todas las maderas</option>{Object.values(maderas).map((m) => <option key={m.nombre}>{m.nombre}</option>)}</select>
        <select className={campo} aria-label="Tipo"><option>Todos los tipos</option><option>Bloque</option><option>Panel</option><option>Especial</option></select>
        <label className="inline-flex items-center gap-2 px-2 text-sm text-tinta-suave"><input type="checkbox" className="accent-[var(--rauli)]" /> Solo bajo mínimo</label>
      </div>

      <Panel sinRelleno>
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th><Th>Modelo</Th><Th>Madera</Th><Th>Medida</Th><Th>Tipo</Th>
              <Th alinear="der">Existencia</Th><Th alinear="der">Reservado</Th><Th alinear="der">Disponible</Th><Th>Nivel</Th>
            </tr>
          </thead>
          <tbody>
            {articulos.map((a) => {
              const d = disponible(a);
              return (
                <Tr key={a.codigo}>
                  <Td><Link href={`/stock/${a.codigo}`}><Placa codigo={a.codigo} className="hover:border-tinta" /></Link></Td>
                  <Td className="font-medium">{a.modelo}</Td>
                  <Td><Madera id={a.madera} /></Td>
                  <Td className="text-tinta-suave">{a.ancho} × {metros(a.alto)}</Td>
                  <Td className="text-tinta-suave">{a.tipo}</Td>
                  <Td alinear="der">{a.existencia}</Td>
                  <Td alinear="der" className="text-tinta-suave">{a.reservado || "—"}</Td>
                  <Td alinear="der" className={cn("font-semibold", d < a.minimo && "text-ambar")}>
                    {d}{d < a.minimo && <span className="ml-1 text-[10px] font-medium uppercase tracking-wide">bajo mín.</span>}
                  </Td>
                  <Td><Nivel existencia={a.existencia} reservado={a.reservado} minimo={a.minimo} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      </Panel>
      <p className="mt-4 flex items-center gap-4 text-xs text-tinta-tenue">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-musgo" /> existencia</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.35)_0_2px,transparent_2px_4px)]" /> reservado</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-tinta" /> mínimo</span>
        <span className="ml-auto">12 de 8.316 artículos con stock · lista v3</span>
      </p>
    </>
  );
}
