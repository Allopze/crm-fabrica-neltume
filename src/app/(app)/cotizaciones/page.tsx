import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { BotonLink, Encabezado, Panel } from "@/components/ui/base";
import { EstadoCotizacionEtiqueta } from "@/components/ui/estado-cotizacion";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { cotizaciones, nombreCliente } from "@/mock/comercial";
import { clp, fecha, fechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Cotizaciones" };

const filtros = ["Todas", "Borradores", "Aprobadas", "Aceptadas", "Vencidas"];

export default function CotizacionesPage() {
  return (
    <>
      <Encabezado
        antetitulo="Ventas · cotizaciones"
        titulo="Cotizaciones"
        descripcion="Cada cotización guarda el texto original, lo que entendió la IA, la versión de lista usada y quién la aprobó."
        acciones={
          <>
            <BotonLink href="/cotizaciones/manual">Cotizar a mano</BotonLink>
            <BotonLink href="/cotizaciones/nueva" variante="primario"><Plus className="h-4 w-4" /> Desde texto</BotonLink>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por estado">
        {filtros.map((f, i) => (
          <button key={f} role="tab" aria-selected={i === 0}
            className={i === 0 ? "rounded-full bg-tinta px-3.5 py-1.5 text-sm text-lamina" : "rounded-full border border-linea px-3.5 py-1.5 text-sm text-tinta-suave hover:border-tinta hover:text-tinta"}>
            {f}
          </button>
        ))}
      </div>

      <Panel sinRelleno>
        <Tabla>
          <thead>
            <tr><Th>N.º</Th><Th>Cliente</Th><Th>Creada</Th><Th>Origen</Th><Th>Estado</Th><Th>Vigencia</Th><Th alinear="der">Total</Th></tr>
          </thead>
          <tbody>
            {cotizaciones.map((c) => (
              <Tr key={c.id}>
                <Td><Link href={`/cotizaciones/${c.id}`} className="font-mono font-medium text-rauli hover:underline">#{c.numero}</Link></Td>
                <Td className="font-medium">{nombreCliente(c.clienteId)}</Td>
                <Td className="text-tinta-suave">{fechaHora(c.creada)}</Td>
                <Td className="text-tinta-suave">{c.origen === "ia" ? "Texto + IA" : "Manual"}</Td>
                <Td><EstadoCotizacionEtiqueta estado={c.estado} /></Td>
                <Td className="text-tinta-suave">{c.vigenciaHasta ? `hasta ${fecha(c.vigenciaHasta)}` : "—"}</Td>
                <Td alinear="der" className="font-medium">{c.total ? clp(c.total) : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      </Panel>
      <p className="mt-4 text-sm text-tinta-tenue">Mostrando 6 de 124 · <button className="text-rauli hover:underline">cargar más</button></p>
    </>
  );
}
