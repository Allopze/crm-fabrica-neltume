// Lectura de notas de pedido (REQ-COT-8.1, REQ-STK-7.3): reservado y faltante por ítem; cliente solo con clientes.ver.
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { cliente, cotizacion, notaPedido, pedidoItem } from "@/db/esquema/comercial";
import { ordenProduccion } from "@/db/esquema/produccion";
import { ErrorDominio } from "../errores";

export async function obtenerPedido(tx: Tx, id: string, verCliente: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  const [p] = await tx.select({ pedido: notaPedido, cotizacion: { id: cotizacion.id, numero: cotizacion.numero, subtotal: cotizacion.subtotal, descuento: cotizacion.descuento, iva: cotizacion.iva, total: cotizacion.total } })
    .from(notaPedido).innerJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId)).where(eq(notaPedido.id, id));
  if (!p) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  const items = await tx.select({ id: pedidoItem.id, codigo: articulo.codigo, descripcion: pedidoItem.descripcion, medidaSolicitada: pedidoItem.medidaSolicitada, cantidad: pedidoItem.cantidad,
    reservado: pedidoItem.reservado, faltante: pedidoItem.faltante, precioUnitario: pedidoItem.precioUnitario, totalLinea: pedidoItem.totalLinea })
    .from(pedidoItem).leftJoin(articulo, eq(articulo.id, pedidoItem.articuloId)).where(eq(pedidoItem.notaPedidoId, id)).orderBy(asc(pedidoItem.orden));
  const [cli] = verCliente ? await tx.select().from(cliente).where(eq(cliente.id, p.pedido.clienteId)) : [];
  const ordenes = await tx.select({ id: ordenProduccion.id, numero: ordenProduccion.numero, estado: ordenProduccion.estado })
    .from(ordenProduccion).where(eq(ordenProduccion.notaPedidoId, id)).orderBy(asc(ordenProduccion.numero));
  return {
    ...p.pedido, cotizacion: p.cotizacion, items, ordenes,
    cliente: cli ? { nombre: cli.nombre, rut: cli.rut, comuna: cli.comuna, contacto: cli.contacto, telefono: cli.telefono } : { nombre: "(oculto)" },
  };
}

export async function listarPedidos(tx: Tx, f: { estado?: string; antesDe?: number; limite?: number }, verCliente: boolean) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const filas = await tx.select({
    id: notaPedido.id, numero: notaPedido.numero, estado: notaPedido.estado, creadoEn: notaPedido.creadoEn, cliente: cliente.nombre,
    cotizacion: cotizacion.numero, total: cotizacion.total,
    cantidad: sql<number>`(SELECT coalesce(sum(cantidad), 0)::int FROM ${pedidoItem} WHERE ${pedidoItem.notaPedidoId} = ${notaPedido.id})`,
    reservado: sql<number>`(SELECT coalesce(sum(reservado), 0)::int FROM ${pedidoItem} WHERE ${pedidoItem.notaPedidoId} = ${notaPedido.id})`,
  }).from(notaPedido).innerJoin(cotizacion, eq(cotizacion.id, notaPedido.cotizacionId)).innerJoin(cliente, eq(cliente.id, notaPedido.clienteId))
    .where(and(f.estado ? eq(notaPedido.estado, f.estado) : undefined, f.antesDe ? lt(notaPedido.numero, f.antesDe) : undefined))
    .orderBy(desc(notaPedido.numero)).limit(limite + 1);
  const datos = filas.slice(0, limite).map((x) => ({ ...x, cliente: verCliente ? x.cliente : "(oculto)" }));
  return { datos, siguiente: filas.length > limite ? datos.at(-1)!.numero : null };
}
