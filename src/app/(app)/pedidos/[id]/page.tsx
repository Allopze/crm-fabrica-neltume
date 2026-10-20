import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, Hammer } from "lucide-react";
import { BotonDescarga, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { estadoPago, estadoPedido, MEDIOS } from "@/components/ui/estado-pedido";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { ErrorDominio } from "@/domain/errores";
import { obtenerPedido } from "@/domain/pedidos/consulta";
import { hoySantiago } from "@/domain/precios/dias-habiles";
import { opcionesDeDespacho } from "@/domain/puertas/consulta";
import { textoAccion } from "@/lib/auditoria-texto";
import { clp, fecha, fechaHora } from "@/lib/formato";
import { AccionesCiclo } from "./acciones-ciclo";
import { CancelarPedido } from "./cancelar-pedido";
import { FormularioDespacho } from "./despacho";
import { Pagos } from "./pagos";

export const metadata: Metadata = { title: "Nota de pedido" };

/** Detalle breve de cada paso del historial (REQ-COT-8.15), desde lo que guardó la auditoría. */
function detallePaso(accion: string, d: Record<string, unknown> | null): string | null {
  if (!d) return null;
  if (accion === "pedido en produccion") return d.orden ? `Orden N.º ${d.orden}` : null;
  if (accion === "registrar pago") return `${clp(Number(d.monto))} · ${MEDIOS[String(d.medio)] ?? d.medio}`;
  if (accion === "revertir pago" || accion === "cancelar pedido") return d.motivo ? String(d.motivo) : null;
  if (accion === "excepcion de pago") return `${d.tipo === "abono" ? "Producir sin abono" : "Despachar con saldo"}: ${d.motivo}`;
  return null;
}

export default async function PedidoPage({ params }: PageProps<"/pedidos/[id]">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("pedidos.gestionar")) return <SinPermiso permiso="pedidos.gestionar" />;
  const { id } = await params;
  const p = await obtenerPedido(bd(), id, sesion.permisos.has("clientes.ver")).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const e = estadoPedido(p.estado);
  const ep = estadoPago(p.pago.estado);
  const puedePagos = sesion.permisos.has("pagos.registrar");
  // Compuertas de pago (REQ-COT-8.13): lo que falta para producir o despachar, salvo excepción.
  const bloqueo = {
    abono: p.exigePago && !p.excepcionAbonoEn && p.pago.estado === "sin_abono" ? p.pago.faltaAbono : null,
    saldo: p.exigePago && !p.excepcionSaldoEn && p.pago.saldo > 0 ? p.pago.saldo : null,
  };
  const cancelada = p.estado === "cancelada";
  const abierta = !cancelada && p.estado !== "despachada";
  const faltanteCatalogo = p.items.filter((i) => i.codigo).reduce((t, i) => t + i.faltante, 0);
  const itemsAPedido = p.items.filter((i) => !i.codigo).length;
  const reservas = p.items.reduce((t, i) => t + i.reservado, 0);
  // Al despachar se eligen las puertas de cada artículo (REQ-STK-8.3).
  const deCatalogo = p.items.filter((i) => i.articuloId);
  const opciones = p.estado === "lista" ? await opcionesDeDespacho(bd(), [...new Set(deCatalogo.map((i) => i.articuloId!))]) : new Map();
  const grupos = [...opciones.keys()].map((a) => {
    const suyos = deCatalogo.filter((i) => i.articuloId === a);
    return { articulo: suyos[0].codigo!, descripcion: suyos[0].descripcion, cantidad: suyos.reduce((t, i) => t + i.cantidad, 0), opciones: opciones.get(a) ?? [] };
  });

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/pedidos" className="hover:text-tinta">Notas de pedido</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="text-tinta">N.º {p.numero}</span>
      </nav>
      <Encabezado
        titulo={<>Nota de pedido <span className="text-rauli">N.º {p.numero}</span></>}
        meta={`${p.cotizacion ? `Desde la cotización N.º ${p.cotizacion.numero}` : `Desde la nota N.º ${p.refExterna} de la tienda`} · ${fecha(new Date(p.creadoEn).toISOString())}`}
        descripcion={<>{p.cliente.nombre}{p.proyecto && <> · proyecto {p.proyecto}</>}{p.cotizacion && <> · <Link href={`/cotizaciones/${p.cotizacion.id}`} className="text-rauli hover:underline">ver cotización</Link></>}</>}
        acciones={
          <>
            <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
            {!(cancelada && p.pago.pagado === 0) && <Etiqueta tono={ep.tono}>{ep.texto}</Etiqueta>}
            {p.atrasoDias > 0 && <Etiqueta tono="error">Atrasada {p.atrasoDias === 1 ? "1 día" : `${p.atrasoDias} días`}</Etiqueta>}
            {sesion.permisos.has("clientes.ver") && <BotonDescarga href={`/api/v1/pedidos/${p.id}/pdf`}><Download className="h-4 w-4" /> PDF</BotonDescarga>}
          </>
        }
      />
      {cancelada && (
        <p role="status" className="mb-6 rounded-lg border border-error/25 bg-error-velo px-5 py-3 text-sm text-error">
          Cancelada el {fecha(new Date(p.canceladaEn!).toISOString())}: {p.motivoCancelacion}. Las reservas se liberaron.
          {p.pago.pagado > 0 && <> Pagado {clp(p.pago.pagado)}; sin devolución registrada.</>}
        </p>
      )}

      {p.estado === "despachada" && p.despachadaEn && (
        <p role="status" className="mb-6 rounded-lg border border-musgo/30 bg-musgo-velo px-5 py-3 text-sm text-musgo">
          Despachada el {fecha(new Date(p.despachadaEn).toISOString())}: la reserva se liberó y el stock se descontó.
        </p>
      )}
      {abierta && (
        <Panel titulo="Avance" className="mb-8">
          <AccionesCiclo id={p.id} estado={p.estado} faltanteCatalogo={faltanteCatalogo} itemsAPedido={itemsAPedido}
            puedeProducir={sesion.permisos.has("produccion.gestionar")} grupos={p.estado === "lista" ? grupos : []} csrf={sesion.csrf}
            bloqueo={bloqueo} puedeExcepcion={puedePagos} />
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-linea pt-4">
            <p className="text-sm text-tinta-tenue">¿El cliente desistió? Cancelar libera las reservas.</p>
            <CancelarPedido id={p.id} csrf={sesion.csrf} reservas={reservas} pagado={p.pago.pagado} />
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Ítems y reserva">
          <ul className="space-y-6">
            {p.items.map((i) => (
              <li key={i.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-3">{i.codigo ? <Placa codigo={i.codigo} /> : <span className="text-xs font-semibold uppercase tracking-wider text-pizarra">A pedido</span>}
                    <span className="text-sm">{i.descripcion}{i.medidaSolicitada && <span className="block text-xs text-tinta-tenue">Medida solicitada: {i.medidaSolicitada}</span>}</span></span>
                  <span className="text-sm tabular-nums text-tinta-suave">{cancelada ? `${i.cantidad} u` : p.estado === "despachada" ? `${i.cantidad} ${i.cantidad === 1 ? "despachada" : "despachadas"}` : `${i.reservado} de ${i.cantidad} reservadas`}</span>
                </div>
                {/* Una celda por puerta (hasta 40): reservada (llena) o por fabricar (rayada) */}
                {abierta && i.cantidad <= 40 && (
                  <div className="mt-2.5 flex gap-1" aria-label={`${i.reservado} reservadas y ${i.faltante} por fabricar`}>
                    {Array.from({ length: i.cantidad }, (_, k) => (
                      <span key={k} className={k < i.reservado
                        ? "h-8 flex-1 rounded-[3px] bg-musgo/80"
                        : "h-8 flex-1 rounded-[3px] border border-dashed border-pizarra bg-[repeating-linear-gradient(135deg,var(--pizarra-velo)_0_4px,transparent_4px_8px)]"} />
                    ))}
                  </div>
                )}
                {abierta && i.faltante > 0 && (
                  <p className="mt-2 flex items-center justify-between text-sm text-pizarra">
                    <span>{i.faltante === 1 ? "Falta 1" : `Faltan ${i.faltante}`} por fabricar</span>
                    {i.codigo && <Link href={`/produccion?vista=ordenes`} className="-my-2 inline-flex items-center gap-1 py-2 hover:underline"><Hammer className="h-3.5 w-3.5" /> Ir a producción</Link>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-8">
          <Panel titulo="Pagos">
            <Pagos id={p.id} csrf={sesion.csrf} resumen={p.pago} pagos={p.pagos}
              puedeRegistrar={puedePagos} cancelada={cancelada} hoy={hoySantiago()} />
            {(p.excepcionAbonoEn || p.excepcionSaldoEn) && (
              <ul className="mt-4 space-y-1 border-t border-linea pt-3 text-xs text-tinta-suave">
                {p.excepcionAbonoEn && <li>Excepción: producir sin abono — {p.excepcionAbonoMotivo} ({fecha(new Date(p.excepcionAbonoEn).toISOString())})</li>}
                {p.excepcionSaldoEn && <li>Excepción: despachar con saldo — {p.excepcionSaldoMotivo} ({fecha(new Date(p.excepcionSaldoEn).toISOString())})</li>}
              </ul>
            )}
          </Panel>
          <Panel titulo="Despacho">
            {abierta ? (
              <FormularioDespacho id={p.id} csrf={sesion.csrf} inicial={{ direccionDespacho: p.direccionDespacho, medioTransporte: p.medioTransporte, entregaComprometida: p.entregaComprometida, observaciones: p.observaciones }} />
            ) : (
              <dl className="space-y-3 text-sm">
                <div><dt className="text-tinta-tenue">Dirección de despacho</dt><dd className="mt-0.5">{p.direccionDespacho ?? "Retira en fábrica"}</dd></div>
                <div><dt className="text-tinta-tenue">Medio de transporte</dt><dd className="mt-0.5">{p.medioTransporte ?? "—"}</dd></div>
                <div><dt className="text-tinta-tenue">Entrega comprometida</dt><dd className="mt-0.5">{p.entregaComprometida ? fecha(p.entregaComprometida) : "—"}</dd></div>
                {p.observaciones && <div><dt className="text-tinta-tenue">Observaciones</dt><dd className="mt-0.5 whitespace-pre-wrap">{p.observaciones}</dd></div>}
              </dl>
            )}
            <p className="mt-5 flex items-baseline justify-between border-t border-linea pt-4 text-sm"><span className="text-tinta-tenue">{p.cotizacion ? "Total (precios congelados)" : "Total (lista vigente, IVA incl.)"}</span><span className="font-display text-2xl tabular-nums">{clp(p.totales.total)}</span></p>
          </Panel>
          {p.ordenes.length > 0 && (
            <Panel titulo="Órdenes de producción">
              <ul className="space-y-2 text-sm">
                {p.ordenes.map((o) => (
                  <li key={o.id} className="flex items-center justify-between"><Link href={`/produccion?orden=${o.id}`} className="text-rauli hover:underline">Orden N.º {o.numero}</Link><Etiqueta tono={o.estado === "abierta" ? "pizarra" : o.estado === "cerrada" ? "musgo" : "neutro"}>{o.estado.charAt(0).toUpperCase() + o.estado.slice(1)}</Etiqueta></li>
                ))}
              </ul>
            </Panel>
          )}
          {p.historial.length > 0 && (
            <Panel titulo="Historial">
              <ol className="space-y-3 text-sm">
                {p.historial.map((h, k) => {
                  const d = detallePaso(h.accion, h.detalle as Record<string, unknown> | null);
                  return (
                    <li key={k} className="grid grid-cols-[auto_1fr] gap-x-3">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-linea-fuerte" aria-hidden />
                      <span><span className="font-medium">{textoAccion(h.accion)}</span>{d && <span className="text-tinta-suave"> · {d}</span>}
                        <span className="block text-xs text-tinta-tenue">{fechaHora(new Date(h.en).toISOString())} · {h.actor}</span></span>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
