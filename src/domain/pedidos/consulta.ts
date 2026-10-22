// Lectura de notas de pedido (REQ-COT-8.1, REQ-STK-7.3): reservado y faltante por ítem; cliente solo con clientes.ver.
// Suma el estado de pago, los pagos, el historial de estados y el atraso (REQ-COT-8.12, 8.15; ADR-0020).
import { and, asc, count, desc, eq, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { cliente, cotizacion, notaPedido, pagoPedido, pedidoItem } from "@/db/esquema/comercial";
import { ordenProduccion } from "@/db/esquema/produccion";
import { auditLog, usuario } from "@/db/esquema/seguridad";
import { ErrorDominio } from "../errores";
import { calcularTotales } from "../precios/calcular";
import { hoySantiago } from "../precios/dias-habiles";
import { ESTADOS_ABIERTOS } from "./completar";
import { abonoPct, calcularPago, type EstadoPago } from "./pagos";

/** Días de atraso: entrega comprometida vencida en una nota abierta (REQ-COT-8.15); 0 si no hay atraso. */
export function diasAtraso(entrega: string | null, estado: string, hoy = hoySantiago()): number {
  if (!entrega || !(ESTADOS_ABIERTOS as readonly string[]).includes(estado) || entrega >= hoy) return 0;
  return Math.round((Date.parse(hoy) - Date.parse(entrega)) / 86_400_000);
}

// Pasos del historial de la nota, tomados de la auditoría (fecha y usuario de cada uno).
const PASOS = ["crear pedido", "pedido en produccion", "completar reserva", "pedido lista", "pedido despachada", "cancelar pedido",
  "registrar pago", "revertir pago", "excepcion de pago"];

export async function obtenerPedido(tx: Tx, id: string, verCliente: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  const [p] = await tx.select({ pedido: notaPedido, cotizacion: { id: cotizacion.id, numero: cotizacion.numero, subtotal: cotizacion.subtotal, descuento: cotizacion.descuento, iva: cotizacion.iva, total: cotizacion.total } })
    .from(notaPedido).leftJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId)).where(eq(notaPedido.id, id));
  if (!p) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  const items = await tx.select({ id: pedidoItem.id, articuloId: pedidoItem.articuloId, codigo: articulo.codigo, descripcion: pedidoItem.descripcion, medidaSolicitada: pedidoItem.medidaSolicitada, cantidad: pedidoItem.cantidad,
    reservado: pedidoItem.reservado, faltante: pedidoItem.faltante, precioUnitario: pedidoItem.precioUnitario, totalLinea: pedidoItem.totalLinea })
    .from(pedidoItem).leftJoin(articulo, eq(articulo.id, pedidoItem.articuloId)).where(eq(pedidoItem.notaPedidoId, id)).orderBy(asc(pedidoItem.orden));
  const [cli] = verCliente ? await tx.select().from(cliente).where(eq(cliente.id, p.pedido.clienteId)) : [];
  const ordenes = await tx.select({ id: ordenProduccion.id, numero: ordenProduccion.numero, estado: ordenProduccion.estado })
    .from(ordenProduccion).where(eq(ordenProduccion.notaPedidoId, id)).orderBy(asc(ordenProduccion.numero));
  // Desde cotización: sus totales congelados. Desde la nota de la tienda: se calculan con las líneas (sin descuento).
  const totales = p.cotizacion
    ? { subtotal: Number(p.cotizacion.subtotal), descuento: Number(p.cotizacion.descuento), iva: Number(p.cotizacion.iva), total: Number(p.cotizacion.total) }
    : calcularTotales(items.map((i) => Number(i.totalLinea)));
  const pagos = await tx.select({ id: pagoPedido.id, monto: pagoPedido.monto, fecha: pagoPedido.fecha, medio: pagoPedido.medio, referencia: pagoPedido.referencia,
    revierteId: pagoPedido.revierteId, motivo: pagoPedido.motivo, creadoEn: pagoPedido.creadoEn, registradoPor: usuario.nombre })
    .from(pagoPedido).innerJoin(usuario, eq(usuario.id, pagoPedido.registradoPor)).where(eq(pagoPedido.notaPedidoId, id)).orderBy(asc(pagoPedido.creadoEn), asc(pagoPedido.id));
  const revertidos = new Set(pagos.flatMap((x) => (x.revierteId ? [x.revierteId] : [])));
  const pago = calcularPago({ total: totales.total, pagado: pagos.reduce((t, x) => t + Number(x.monto), 0), abonoPct: await abonoPct(tx), exigePago: p.pedido.exigePago });
  const historial = await tx.select({ en: auditLog.ocurridoEn, accion: auditLog.accion, actor: usuario.nombre, detalle: auditLog.despues })
    .from(auditLog).leftJoin(usuario, eq(usuario.id, auditLog.actorId))
    .where(and(eq(auditLog.recurso, "nota_pedido"), eq(auditLog.recursoId, id), eq(auditLog.resultado, "ok"), inArray(auditLog.accion, PASOS))).orderBy(asc(auditLog.id));
  return {
    ...p.pedido, cotizacion: p.cotizacion, totales: { subtotal: totales.subtotal, descuento: totales.descuento, iva: totales.iva, total: totales.total }, items, ordenes,
    cliente: cli ? { nombre: cli.nombre, rut: cli.rut, comuna: cli.comuna, contacto: cli.contacto, telefono: cli.telefono } : { nombre: "(oculto)" },
    pago, pagos: pagos.map((x) => ({ ...x, monto: Number(x.monto), revertido: revertidos.has(x.id) })),
    historial: historial.map((h) => ({ ...h, actor: h.actor ?? "Sistema" })),
    atrasoDias: diasAtraso(p.pedido.entregaComprometida, p.pedido.estado),
  };
}

// Total con IVA y pagado por nota, en SQL para filtrar y contar (mismas reglas que calcularPago).
const totalNota = sql<number>`coalesce(${cotizacion.total}, (SELECT round(sum(${pedidoItem.totalLinea}) * 1.19)::bigint FROM ${pedidoItem} WHERE ${pedidoItem.notaPedidoId} = ${notaPedido.id}))`;
const pagadoNota = sql<number>`(SELECT coalesce(sum(${pagoPedido.monto}), 0)::bigint FROM ${pagoPedido} WHERE ${pagoPedido.notaPedidoId} = ${notaPedido.id})`;
const estadoPagoNota = (pct: number): SQL<EstadoPago> => sql<EstadoPago>`CASE WHEN NOT ${notaPedido.exigePago} AND ${pagadoNota} = 0 THEN 'sin_control'
  WHEN ${pagadoNota} >= ${totalNota} THEN 'pagado' WHEN ${pagadoNota} >= ceil(${totalNota} * ${pct}::numeric / 100) THEN 'abonado' ELSE 'sin_abono' END`;

export interface FiltroPedidos { estado?: string; estadoPago?: EstadoPago; clienteId?: string; antesDe?: number; limite?: number }

export async function listarPedidos(tx: Tx, f: FiltroPedidos, verCliente: boolean) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const pct = await abonoPct(tx);
  const filtros = [f.estado ? eq(notaPedido.estado, f.estado) : undefined, f.estadoPago ? sql`${estadoPagoNota(pct)} = ${f.estadoPago}` : undefined,
    f.clienteId ? eq(notaPedido.clienteId, f.clienteId) : undefined];
  const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(notaPedido).leftJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId))
    .where(and(...filtros));
  const filas = await tx.select({
    id: notaPedido.id, numero: notaPedido.numero, estado: notaPedido.estado, creadoEn: notaPedido.creadoEn, cliente: cliente.nombre,
    cotizacion: cotizacion.numero, origen: notaPedido.origen, refExterna: notaPedido.refExterna, entregaComprometida: notaPedido.entregaComprometida,
    total: totalNota, pagado: pagadoNota, estadoPago: estadoPagoNota(pct),
    cantidad: sql<number>`(SELECT coalesce(sum(cantidad), 0)::int FROM ${pedidoItem} WHERE ${pedidoItem.notaPedidoId} = ${notaPedido.id})`,
    reservado: sql<number>`(SELECT coalesce(sum(reservado), 0)::int FROM ${pedidoItem} WHERE ${pedidoItem.notaPedidoId} = ${notaPedido.id})`,
  }).from(notaPedido).leftJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId)).innerJoin(cliente, eq(cliente.id, notaPedido.clienteId))
    .where(and(...filtros, f.antesDe ? lt(notaPedido.numero, f.antesDe) : undefined))
    .orderBy(desc(notaPedido.numero)).limit(limite + 1);
  const hoy = hoySantiago();
  const datos = filas.slice(0, limite).map((x) => ({ ...x, total: Number(x.total), pagado: Number(x.pagado), cliente: verCliente ? x.cliente : "(oculto)",
    atrasoDias: diasAtraso(x.entregaComprometida, x.estado, hoy) }));
  return { datos, total, siguiente: filas.length > limite ? datos.at(-1)!.numero : null };
}

/** Conteo de notas por estado y por estado de pago, para los filtros de la lista. */
export async function contarPedidos(tx: Tx) {
  const base = tx.select({ estado: notaPedido.estado, estadoPago: estadoPagoNota(await abonoPct(tx)).as("estado_pago") })
    .from(notaPedido).leftJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId)).as("t");
  const filas = await tx.select({ estado: base.estado, estadoPago: base.estadoPago, n: count() }).from(base).groupBy(base.estado, base.estadoPago);
  const porEstado: Record<string, number> = {};
  const porPago: Record<string, number> = {};
  for (const r of filas) {
    porEstado[r.estado] = (porEstado[r.estado] ?? 0) + r.n;
    porPago[r.estadoPago] = (porPago[r.estadoPago] ?? 0) + r.n;
  }
  return { total: filas.reduce((t, r) => t + r.n, 0), porEstado, porPago };
}

/** Panel (UX §1): notas abiertas que esperan el abono para producir o pasaron su entrega comprometida. */
export async function pedidosPorAtender(tx: Tx, verCliente: boolean) {
  const hoy = hoySantiago();
  const sinAbono = sql<boolean>`${notaPedido.estado} = 'pendiente' AND ${notaPedido.excepcionAbonoEn} IS NULL AND ${estadoPagoNota(await abonoPct(tx))} = 'sin_abono'`;
  const filas = await tx.select({ id: notaPedido.id, numero: notaPedido.numero, cliente: cliente.nombre, estado: notaPedido.estado,
    entregaComprometida: notaPedido.entregaComprometida, sinAbono })
    .from(notaPedido).leftJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId)).innerJoin(cliente, eq(cliente.id, notaPedido.clienteId))
    .where(and(inArray(notaPedido.estado, [...ESTADOS_ABIERTOS]), sql`(${sinAbono} OR ${notaPedido.entregaComprometida} < ${hoy})`))
    .orderBy(asc(notaPedido.numero)).limit(6);
  return filas.map((f) => ({ ...f, cliente: verCliente ? f.cliente : "(oculto)", atrasoDias: diasAtraso(f.entregaComprometida, f.estado, hoy) }));
}
