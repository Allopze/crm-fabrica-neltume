import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, Hammer } from "lucide-react";
import { BotonDescarga, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { estadoPedido } from "@/components/ui/estado-pedido";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { ErrorDominio } from "@/domain/errores";
import { obtenerPedido } from "@/domain/pedidos/consulta";
import { clp, fecha } from "@/lib/formato";
import { CancelarPedido } from "./cancelar-pedido";

export const metadata: Metadata = { title: "Nota de pedido" };

export default async function PedidoPage({ params }: PageProps<"/pedidos/[id]">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("pedidos.gestionar")) return <SinPermiso permiso="pedidos.gestionar" />;
  const { id } = await params;
  const p = await obtenerPedido(bd(), id, sesion.permisos.has("clientes.ver")).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const e = estadoPedido(p.estado);
  const cancelada = p.estado === "cancelada";

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/pedidos" className="hover:text-tinta">Notas de pedido</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="text-tinta">N.º {p.numero}</span>
      </nav>
      <Encabezado
        antetitulo={`Desde cotización #${p.cotizacion.numero} · ${fecha(new Date(p.creadoEn).toISOString())}`}
        titulo={<>Nota de pedido <span className="text-rauli">{p.numero}</span></>}
        descripcion={<>{p.cliente.nombre} · <Link href={`/cotizaciones/${p.cotizacion.id}`} className="text-rauli hover:underline">ver cotización</Link></>}
        acciones={
          <>
            <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
            {sesion.permisos.has("clientes.ver") && <BotonDescarga href={`/api/v1/pedidos/${p.id}/pdf`}><Download className="h-4 w-4" /> PDF</BotonDescarga>}
            {!cancelada && p.estado !== "despachada" && <CancelarPedido id={p.id} csrf={sesion.csrf} />}
          </>
        }
      />
      {cancelada && (
        <p role="status" className="mb-6 rounded-lg border border-error/25 bg-error-velo px-5 py-3 text-sm text-error">
          Cancelada el {fecha(new Date(p.canceladaEn!).toISOString())}: {p.motivoCancelacion}. Las reservas se liberaron.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Ítems y reserva">
          <ul className="space-y-6">
            {p.items.map((i) => (
              <li key={i.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-3">{i.codigo ? <Placa codigo={i.codigo} /> : <span className="text-xs font-semibold uppercase tracking-wider text-pizarra">A pedido</span>}<span className="text-sm">{i.descripcion}</span></span>
                  <span className="text-sm tabular-nums text-tinta-suave">{cancelada ? `${i.cantidad} u` : `${i.reservado} de ${i.cantidad} reservadas`}</span>
                </div>
                {/* Una celda por puerta (hasta 40): reservada (llena) o por fabricar (rayada) */}
                {!cancelada && i.cantidad <= 40 && (
                  <div className="mt-2.5 flex gap-1" aria-label={`${i.reservado} reservadas y ${i.faltante} por fabricar`}>
                    {Array.from({ length: i.cantidad }, (_, k) => (
                      <span key={k} className={k < i.reservado
                        ? "h-8 flex-1 rounded-[3px] bg-musgo/80"
                        : "h-8 flex-1 rounded-[3px] border border-dashed border-pizarra bg-[repeating-linear-gradient(135deg,var(--pizarra-velo)_0_4px,transparent_4px_8px)]"} />
                    ))}
                  </div>
                )}
                {!cancelada && i.faltante > 0 && (
                  <p className="mt-2 flex items-center justify-between text-sm text-pizarra">
                    <span>Faltan {i.faltante} por fabricar</span>
                    <Link href="/produccion" className="inline-flex items-center gap-1 hover:underline"><Hammer className="h-3.5 w-3.5" /> Ir a producción</Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel titulo="Despacho">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-tinta-tenue">Dirección de despacho</dt><dd className="mt-0.5">{p.direccionDespacho ?? "Retira en fábrica"}</dd></div>
            <div><dt className="text-tinta-tenue">Medio de transporte</dt><dd className="mt-0.5">{p.medioTransporte ?? "—"}</dd></div>
            <div><dt className="text-tinta-tenue">Total (precios congelados de la cotización)</dt><dd className="mt-0.5 font-display text-2xl tabular-nums">{clp(Number(p.cotizacion.total))}</dd></div>
          </dl>
        </Panel>
      </div>
    </>
  );
}
