import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, Hammer, Truck, XCircle } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { nombreCliente, pedidos } from "@/mock/comercial";
import { clp, fecha } from "@/lib/formato";
import { estadosPedido } from "@/components/ui/estado-pedido";

export const metadata: Metadata = { title: "Nota de pedido" };

export default async function PedidoPage({ params }: PageProps<"/pedidos/[id]">) {
  const { id } = await params;
  const p = pedidos.find((x) => x.id === id);
  if (!p) notFound();
  const e = estadosPedido[p.estado];

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/pedidos" className="hover:text-tinta">Notas de pedido</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="text-tinta">N.º {p.numero}</span>
      </nav>
      <Encabezado
        antetitulo={`Desde cotización #${p.cotizacion} · ${fecha(p.creado)}`}
        titulo={<>Nota de pedido <span className="text-rauli">{p.numero}</span></>}
        descripcion={nombreCliente(p.clienteId)}
        acciones={
          <>
            <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
            <Boton variante="peligro"><XCircle className="h-4 w-4" /> Cancelar</Boton>
            <Boton><Download className="h-4 w-4" /> PDF</Boton>
            <Boton variante="primario"><Truck className="h-4 w-4" /> Registrar despacho</Boton>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Ítems y reserva">
          <ul className="space-y-6">
            {p.items.map((i) => (
              <li key={i.codigo}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-3"><Placa codigo={i.codigo} /><span className="text-sm">{i.descripcion}</span></span>
                  <span className="text-sm tabular-nums text-tinta-suave">{i.reservado} de {i.cantidad} reservadas</span>
                </div>
                {/* Una celda por puerta: reservada (llena) o por fabricar (rayada) */}
                <div className="mt-2.5 flex gap-1" aria-label={`${i.reservado} reservadas y ${i.faltante} por fabricar`}>
                  {Array.from({ length: i.cantidad }, (_, k) => (
                    <span key={k} className={k < i.reservado
                      ? "h-8 flex-1 rounded-[3px] bg-musgo/80"
                      : "h-8 flex-1 rounded-[3px] border border-dashed border-pizarra bg-[repeating-linear-gradient(135deg,var(--pizarra-velo)_0_4px,transparent_4px_8px)]"} />
                  ))}
                </div>
                {i.faltante > 0 && (
                  <p className="mt-2 flex items-center justify-between text-sm text-pizarra">
                    <span>Faltan {i.faltante} por fabricar</span>
                    <Link href="/produccion" className="inline-flex items-center gap-1 hover:underline"><Hammer className="h-3.5 w-3.5" /> Ver orden de producción</Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel titulo="Despacho">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-tinta-tenue">Dirección de despacho</dt><dd className="mt-0.5">{p.despacho}</dd></div>
            <div><dt className="text-tinta-tenue">Medio de transporte</dt><dd className="mt-0.5">{p.transporte}</dd></div>
            <div><dt className="text-tinta-tenue">Total (precios congelados de la cotización)</dt><dd className="mt-0.5 font-display text-2xl">{clp(p.total)}</dd></div>
          </dl>
        </Panel>
      </div>
    </>
  );
}
