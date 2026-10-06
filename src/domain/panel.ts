// Datos del panel de inicio (UX §1): borradores por revisar, alertas de stock y MP, pedidos con faltante y cifras del mes.
import { and, count, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cliente, cotizacion, cotizacionItem, notaPedido, pedidoItem } from "@/db/esquema/comercial";
import { materiasParaReponer, puertasBajoMinimo } from "./alertas";

const ABIERTOS = ["cancelada", "despachada"];
const inicioMes = sql`date_trunc('month', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'`;
const pendientes = sql<number>`(SELECT count(*)::int FROM ${cotizacionItem} WHERE ${cotizacionItem.cotizacionId} = ${cotizacion.id} AND ${cotizacionItem.estadoItem} <> 'ok')`;

export async function porRevisar(tx: Tx, verCliente: boolean) {
  const filas = await tx.select({ id: cotizacion.id, numero: cotizacion.numero, estado: cotizacion.estado, origen: cotizacion.origen,
    creadoEn: cotizacion.creadoEn, cliente: cliente.nombre, pendientes })
    .from(cotizacion).leftJoin(cliente, eq(cliente.id, cotizacion.clienteId))
    .where(inArray(cotizacion.estado, ["interpretando", "borrador", "ia_fallida"])).orderBy(desc(cotizacion.numero)).limit(6);
  const [{ n }] = await tx.select({ n: count() }).from(cotizacion).where(inArray(cotizacion.estado, ["interpretando", "borrador", "ia_fallida"]));
  return { total: n, filas: filas.map((f) => ({ ...f, cliente: f.cliente && !verCliente ? "(oculto)" : f.cliente })) };
}

export async function cifrasDelMes(tx: Tx) {
  const [c] = await tx.select({
    creadas: count(),
    // Mediana de minutos entre crear y aprobar, para las aprobadas este mes (SPEC §1: meta ≤ 3 min).
    mediana: sql<number | null>`percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ${cotizacion.aprobadaEn} - ${cotizacion.creadoEn}) / 60) FILTER (WHERE ${cotizacion.aprobadaEn} >= ${inicioMes})`,
  }).from(cotizacion).where(gte(cotizacion.creadoEn, inicioMes));
  const [p] = await tx.select({
    porConfirmar: sql<number>`count(*)::int`, borradores: sql<number>`count(DISTINCT ${cotizacion.id})::int`,
  }).from(cotizacionItem).innerJoin(cotizacion, eq(cotizacion.id, cotizacionItem.cotizacionId))
    .where(and(eq(cotizacion.estado, "borrador"), sql`${cotizacionItem.estadoItem} <> 'ok'`));
  const totalPedido = sql`coalesce(${cotizacion.total}, (SELECT round(sum(${pedidoItem.totalLinea}) * 1.19) FROM ${pedidoItem} WHERE ${pedidoItem.notaPedidoId} = ${notaPedido.id}))`;
  const [ped] = await tx.select({ total: sql<number>`coalesce(sum(${totalPedido}), 0)::bigint`, n: count() })
    .from(notaPedido).leftJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId)).where(notInArray(notaPedido.estado, ABIERTOS));
  return { creadas: c.creadas, medianaMin: c.mediana === null ? null : Number(c.mediana), ...p, pedidosAbiertos: ped.n, totalPedidos: Number(ped.total) };
}

export async function alertasStock(tx: Tx) {
  const [puertas, mp] = await Promise.all([puertasBajoMinimo(tx, 5), materiasParaReponer(tx)]);
  return { puertas, mp: mp.slice(0, 5) };
}

export async function pedidosConFaltante(tx: Tx, verCliente: boolean) {
  const filas = await tx.select({ id: notaPedido.id, numero: notaPedido.numero, cliente: cliente.nombre, faltante: sql<number>`sum(${pedidoItem.faltante})::int` })
    .from(notaPedido).innerJoin(pedidoItem, eq(pedidoItem.notaPedidoId, notaPedido.id)).innerJoin(cliente, eq(cliente.id, notaPedido.clienteId))
    .where(notInArray(notaPedido.estado, ABIERTOS))
    .groupBy(notaPedido.id, cliente.nombre).having(sql`sum(${pedidoItem.faltante}) > 0`).orderBy(desc(notaPedido.numero)).limit(5);
  return filas.map((f) => ({ ...f, cliente: verCliente ? f.cliente : "(oculto)" }));
}
