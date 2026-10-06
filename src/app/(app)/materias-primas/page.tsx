import type { Metadata } from "next";
import { PackagePlus, Plus } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { materiasPrimas } from "@/mock/operacion";
import { cn, fecha, numero } from "@/lib/formato";

export const metadata: Metadata = { title: "Materias primas" };

const campo = "h-10 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

export default function MateriasPrimasPage() {
  const bajas = materiasPrimas.filter((m) => m.existencia < m.minimo).length;
  return (
    <>
      <Encabezado
        antetitulo="Taller · insumos"
        titulo="Materias primas"
        descripcion="Madera, tableros, colas y barnices. Las recepciones suman stock y el cierre de cada orden de producción lo descuenta según el BOM."
        acciones={<Boton><Plus className="h-4 w-4" /> Nueva materia prima</Boton>}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <Panel titulo="Existencias" accion={bajas > 0 && <Etiqueta tono="ambar">{bajas} bajo el mínimo</Etiqueta>} sinRelleno>
          <Tabla>
            <thead><tr><Th>Materia prima</Th><Th>Unidad</Th><Th alinear="der">Existencia</Th><Th alinear="der">Mínimo</Th><Th>Última recepción</Th></tr></thead>
            <tbody>
              {materiasPrimas.map((m) => {
                const baja = m.existencia < m.minimo;
                return (
                  <Tr key={m.id}>
                    <Td className="font-medium">{m.nombre}</Td>
                    <Td className="font-mono text-xs text-tinta-suave">{m.unidad}</Td>
                    <Td alinear="der" className={cn("font-semibold", baja && "text-ambar")}>{numero(m.existencia)}</Td>
                    <Td alinear="der" className="text-tinta-suave">{numero(m.minimo)}</Td>
                    <Td className="text-tinta-suave">{fecha(m.ultimaRecepcion)}{baja && <Etiqueta tono="ambar" className="ml-2">reponer</Etiqueta>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tabla>
        </Panel>

        <Panel titulo="Registrar recepción" className="self-start">
          <form className="space-y-4">
            <div>
              <label htmlFor="mp" className="text-sm font-medium">Materia prima</label>
              <select id="mp" className={`${campo} mt-1.5`}>{materiasPrimas.map((m) => <option key={m.id}>{m.nombre}</option>)}</select>
            </div>
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <div>
                <label htmlFor="cant" className="text-sm font-medium">Cantidad</label>
                <input id="cant" inputMode="decimal" placeholder="0" className={`${campo} mt-1.5 tabular-nums`} />
              </div>
              <p className="self-end pb-2.5 font-mono text-xs text-tinta-tenue">pulg</p>
            </div>
            <div>
              <label htmlFor="ref" className="text-sm font-medium">Guía o factura del proveedor</label>
              <input id="ref" placeholder="Ej. guía 18.442" className={`${campo} mt-1.5`} />
            </div>
            <Boton variante="primario" className="h-10 w-full" type="button"><PackagePlus className="h-4 w-4" /> Registrar recepción</Boton>
            <p className="text-xs text-tinta-tenue">Si el envío se repite por mala conexión, se registra una sola vez.</p>
          </form>
        </Panel>
      </div>
    </>
  );
}
