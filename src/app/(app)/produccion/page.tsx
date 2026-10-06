import type { Metadata } from "next";
import { CheckCheck, Plus, TriangleAlert } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { boms, materiasPrimas, ordenes } from "@/mock/operacion";
import { cn, fecha, numero } from "@/lib/formato";

export const metadata: Metadata = { title: "Producción y BOM" };

const mp = (id: string) => materiasPrimas.find((m) => m.id === id)!;

export default function ProduccionPage() {
  const bom = boms[0];
  const orden = ordenes[1]; // NEL-R-4-B × 2, abierta
  return (
    <>
      <Encabezado
        antetitulo="Taller · producción"
        titulo="Producción y BOM"
        descripcion="Al cerrar una orden, el sistema descuenta los insumos según el BOM y suma las puertas terminadas, todo en un solo paso."
        acciones={<Boton variante="primario"><Plus className="h-4 w-4" /> Nueva orden</Boton>}
      />

      <div className="grid gap-8 xl:grid-cols-[1.25fr_1fr]">
        <Panel titulo="Órdenes de producción" sinRelleno>
          <Tabla>
            <thead><tr><Th>N.º</Th><Th>Artículo</Th><Th alinear="der">Cant.</Th><Th>Origen</Th><Th>Creada</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {ordenes.map((o) => (
                <Tr key={o.id} className={cn(o.id === orden.id && "bg-rauli-velo/40")}>
                  <Td className="font-mono">{o.numero}</Td>
                  <Td><Placa codigo={o.articulo} /></Td>
                  <Td alinear="der">{o.cantidad}</Td>
                  <Td className="text-tinta-suave">{o.pedido ? `Pedido ${o.pedido}` : "Stock"}</Td>
                  <Td className="text-tinta-suave">{fecha(o.creada)}</Td>
                  <Td>{o.estado === "abierta" ? <Etiqueta tono="pizarra">Abierta</Etiqueta> : <Etiqueta tono="musgo">Cerrada</Etiqueta>}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        </Panel>

        {/* Vista previa del cierre: lo que se moverá antes de confirmar */}
        <Panel titulo={<>Cerrar orden {orden.numero}</>} accion={<Etiqueta tono="ambar">BOM DEMO</Etiqueta>}>
          <p className="text-sm text-tinta-suave">
            Entrarán <strong className="text-tinta">{orden.cantidad} × <Placa codigo={orden.articulo} /></strong> al stock y se consumirá:
          </p>
          <ul className="mt-4 divide-y divide-linea/70 rounded-md border border-linea">
            {bom.lineas.map((l) => {
              const m = mp(l.mp);
              const usa = l.cantidad * orden.cantidad;
              const falta = usa > m.existencia;
              return (
                <li key={l.mp} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>{m.nombre}</span>
                  <span className="font-mono tabular-nums">
                    <span className="text-error">−{numero(usa)}</span> <span className="text-tinta-tenue">{m.unidad} · quedan {numero(m.existencia - usa)}</span>
                    {falta && <TriangleAlert className="ml-1 inline h-3.5 w-3.5 text-error" />}
                  </span>
                </li>
              );
            })}
          </ul>
          <Boton variante="primario" className="mt-5 h-10 w-full"><CheckCheck className="h-4 w-4" /> Cerrar orden y mover stock</Boton>
          <p className="mt-2 text-xs text-tinta-tenue">Todo o nada: si falta un insumo, no se mueve nada.</p>
        </Panel>
      </div>

      <h2 className="mt-14 mb-4 font-display text-2xl font-medium tracking-tight">Listas de materiales</h2>
      <div className="grid gap-5 md:grid-cols-3">
        {boms.map((b) => (
          <Panel key={b.modelo} titulo={b.modelo} accion={<Etiqueta tono={b.origen === "demo" ? "ambar" : "musgo"}>{b.origen === "demo" ? "DEMO" : "real"}</Etiqueta>}>
            <p className="mb-3 font-mono text-xs text-tinta-tenue">{b.medida} · por puerta</p>
            <ul className="space-y-1.5 text-sm">
              {b.lineas.map((l) => (
                <li key={l.mp} className="flex justify-between gap-3">
                  <span className="truncate">{mp(l.mp).nombre}</span>
                  <span className="shrink-0 font-mono tabular-nums">{numero(l.cantidad)} {mp(l.mp).unidad}</span>
                </li>
              ))}
            </ul>
            <button className="mt-4 text-sm text-rauli hover:underline">Editar BOM</button>
          </Panel>
        ))}
      </div>
    </>
  );
}
