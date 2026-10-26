import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronRight, ClipboardList, Download, FileText, Hammer, Image as Imagen } from "lucide-react";
import { BotonDescarga, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { estadoPago, estadoPedido, MEDIOS } from "@/components/ui/estado-pedido";
import { LineaMedida } from "@/components/ui/linea-medida";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { notaPedido } from "@/db/esquema/comercial";
import { requerirSesion } from "@/domain/auth/servidor";
import { ErrorDominio } from "@/domain/errores";
import { adjuntosRecibidos, datosTienda } from "@/domain/integracion-tienda/consulta";
import { obtenerPedido, vistaDe } from "@/domain/pedidos/consulta";
import { hoySantiago } from "@/domain/precios/dias-habiles";
import { opcionesDeDespacho } from "@/domain/puertas/consulta";
import { textoAccion } from "@/lib/auditoria-texto";
import { clp, fecha, fechaHora } from "@/lib/formato";
import { AccionesCiclo } from "./acciones-ciclo";
import { CancelarPedido } from "./cancelar-pedido";
import { FormularioDespacho } from "./despacho";
import { Pagos } from "./pagos";
import { RevisionTienda } from "./revision-tienda";

export async function generateMetadata({ params }: PageProps<"/pedidos/[id]">): Promise<Metadata> {
  const sesion = await requerirSesion();
  const { id } = await params;
  if (!sesion.permisos.has("pedidos.gestionar") || !/^[0-9a-f-]{36}$/i.test(id)) return { title: "Nota de pedido" };
  const [p] = await bd().select({ numero: notaPedido.numero }).from(notaPedido).where(eq(notaPedido.id, id));
  return { title: p ? `Nota de pedido N.º ${p.numero}` : "Nota de pedido" };
}

/** Detalle breve de cada paso del historial (REQ-COT-8.15), desde lo que guardó la auditoría. */
function detallePaso(accion: string, d: Record<string, unknown> | null): string | null {
  if (!d) return null;
  if (accion === "pedido en produccion") return d.orden ? `Orden N.º ${d.orden}` : null;
  // Sin pedidos.importes.ver el detalle llega sin montos (ADR-0023 §8).
  if (accion === "registrar pago") return [d.monto === undefined ? null : clp(Number(d.monto)), MEDIOS[String(d.medio)] ?? d.medio].filter(Boolean).join(" · ");
  if (accion === "revision de la tienda" || accion === "anulacion de la tienda") return d.revision ? `Revisión ${d.revision}` : null;
  if (accion === "aplicar revision de la tienda" || accion === "descartar revision de la tienda") return d.motivo ? String(d.motivo) : null;
  if (accion === "revertir pago" || accion === "cancelar pedido") return d.motivo ? String(d.motivo) : null;
  if (accion === "excepcion de pago") return `${d.tipo === "abono" ? "Producir sin abono" : "Despachar con saldo"}: ${d.motivo}`;
  return null;
}

export default async function PedidoPage({ params }: PageProps<"/pedidos/[id]">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("pedidos.gestionar")) return <SinPermiso permiso="pedidos.gestionar" />;
  const { id } = await params;
  const vista = vistaDe(sesion.permisos);
  const p = await obtenerPedido(bd(), id, vista).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  // Lo que llegó de la tienda por la API (ADR-0023): documentos, revisiones pendientes y adjuntos del cliente.
  const tienda = await datosTienda(bd(), p.id, vista);
  const recibidos = await adjuntosRecibidos(bd(), p.items.flatMap((i) => i.referencias.map((r) => r.attachmentId)));
  const e = estadoPedido(p.estado);
  const ep = estadoPago(p.pago.estado);
  const puedePagos = sesion.permisos.has("pagos.registrar");
  // Compuertas de pago (REQ-COT-8.13): lo que falta para producir o despachar, salvo excepción.
  // Sin pedidos.importes.ver se sabe que falta pagar, pero no cuánto (ADR-0023 §8).
  const bloqueo = {
    abono: p.exigePago && !p.excepcionAbonoEn && p.pago.estado === "sin_abono" ? { monto: p.pago.faltaAbono } : null,
    saldo: p.exigePago && !p.excepcionSaldoEn && p.pago.estado !== "pagado" ? { monto: p.pago.saldo } : null,
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
        meta={`${p.cotizacion ? `Desde la cotización N.º ${p.cotizacion.numero}` : `Desde la nota N.º ${p.refExterna}${p.revisionExterna > 1 ? ` (rev. ${p.revisionExterna})` : ""} de la tienda`}${p.origen === "tienda_api" ? ", recibida automáticamente" : ""} · ${fecha(new Date(p.creadoEn).toISOString())}`}
        descripcion={<>{p.cliente.nombre}{p.proyecto && <> · proyecto {p.proyecto}</>}{p.cotizacion && <> · <Link href={`/cotizaciones/${p.cotizacion.id}`} className="text-rauli hover:underline">ver cotización</Link></>}</>}
        acciones={
          <>
            <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
            {!(cancelada && (p.pago.pagado ?? 0) === 0) && <Etiqueta tono={ep.tono}>{ep.texto}</Etiqueta>}
            {p.atrasoDias > 0 && <Etiqueta tono="error">Atrasada {p.atrasoDias === 1 ? "1 día" : `${p.atrasoDias} días`}</Etiqueta>}
            <BotonDescarga href={`/api/v1/pedidos/${p.id}/orden-trabajo`}><ClipboardList className="h-4 w-4" /> Orden de trabajo</BotonDescarga>
            {vista.cliente && vista.importes && <BotonDescarga href={`/api/v1/pedidos/${p.id}/pdf`}><Download className="h-4 w-4" /> PDF</BotonDescarga>}
          </>
        }
      />
      {cancelada && (
        <p role="status" className="mb-6 rounded-lg border border-error/25 bg-error-velo px-5 py-3 text-sm text-error">
          Cancelada el {fecha(new Date(p.canceladaEn!).toISOString())}: {p.motivoCancelacion}. Las reservas se liberaron.
          {p.pago.pagado !== null && p.pago.pagado > 0 && <> Pagado {clp(p.pago.pagado)}; sin devolución registrada.</>}
        </p>
      )}

      {tienda?.pendientes.map((x) => (
        <RevisionTienda key={x.id} notaId={p.id} csrf={sesion.csrf} p={{ ...x, creadoEn: new Date(x.creadoEn).toISOString() }} />
      ))}

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

      <div className="grid grid-cols-1 items-start gap-8 [&>*]:min-w-0 lg:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Ítems y reserva">
          <ul className="space-y-6">
            {p.items.map((i) => (
              <li key={i.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-3">{i.codigo ? <Placa codigo={i.codigo} /> : <span className="text-xs font-semibold uppercase tracking-wider text-pizarra">A pedido</span>}
                    <span className="text-sm">{i.descripcion}<LineaMedida titulo={i.descripcion} medida={i.medidaSolicitada} />
                      {i.observacion && <span className="block whitespace-pre-wrap text-xs text-tinta-suave">{i.observacion}</span>}
                      {i.revisar && <span className="mt-1 block text-xs font-medium text-pizarra">Revisar: {i.revisar}</span>}
                      {i.referencias.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {i.referencias.map((r) => recibidos.has(r.attachmentId)
                            ? <a key={r.attachmentId} href={`/api/v1/pedidos/${p.id}/adjuntos/${r.attachmentId}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-rauli hover:underline"><Imagen className="h-3.5 w-3.5" />{r.filename}</a>
                            : <span key={r.attachmentId} className="text-tinta-tenue">{r.filename} (pendiente de recibir)</span>)}
                        </span>
                      )}</span></span>
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
          {tienda && tienda.revision !== null && (
            <Panel titulo="Documentos de la tienda">
              <p className="text-sm text-tinta-suave">Nota N.º {p.refExterna}, revisión {tienda.revision}{tienda.recibidaEn && <>, recibida el {fechaHora(new Date(tienda.recibidaEn).toISOString())}</>}.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {tienda.documentos.map((d) => (
                  <li key={d.tipo}>
                    {d.retenido
                      ? <span className="text-error">{d.tipo === "produccion" ? "Orden de trabajo de la tienda" : "Nota comercial"} retenida: {d.motivoRetencion} Usa la orden de trabajo de la fábrica.</span>
                      : <a href={`/api/v1/pedidos/${p.id}/documentos/${d.tipo}`} className="inline-flex items-center gap-1.5 text-rauli hover:underline"><FileText className="h-4 w-4" />{d.tipo === "produccion" ? "Orden de trabajo de la tienda (sin precios)" : "Nota comercial de la tienda (con precios)"}</a>}
                  </li>
                ))}
              </ul>
              {tienda.avisos.length > 0 && <ul className="mt-3 list-disc space-y-1 border-t border-linea pt-3 pl-5 text-xs text-tinta-suave">{tienda.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
            </Panel>
          )}
          {vista.importes && <Panel titulo="Pagos">
            <Pagos id={p.id} csrf={sesion.csrf} resumen={{ ...p.pago, total: p.pago.total ?? 0, pagado: p.pago.pagado ?? 0, saldo: p.pago.saldo ?? 0, abonoRequerido: p.pago.abonoRequerido ?? 0, faltaAbono: p.pago.faltaAbono ?? 0 }} pagos={p.pagos}
              puedeRegistrar={puedePagos} cancelada={cancelada} hoy={hoySantiago()} />
            {(p.excepcionAbonoEn || p.excepcionSaldoEn) && (
              <ul className="mt-4 space-y-1 border-t border-linea pt-3 text-xs text-tinta-suave">
                {p.excepcionAbonoEn && <li>Excepción: producir sin abono — {p.excepcionAbonoMotivo} ({fecha(new Date(p.excepcionAbonoEn).toISOString())})</li>}
                {p.excepcionSaldoEn && <li>Excepción: despachar con saldo — {p.excepcionSaldoMotivo} ({fecha(new Date(p.excepcionSaldoEn).toISOString())})</li>}
              </ul>
            )}
          </Panel>}
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
            {p.totales && <p className="mt-5 flex items-baseline justify-between border-t border-linea pt-4 text-sm"><span className="text-tinta-tenue">{p.cotizacion ? "Total (precios congelados)" : "Total (lista vigente, IVA incl.)"}</span><span className="font-display text-2xl tabular-nums">{clp(p.totales.total)}</span></p>}
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
