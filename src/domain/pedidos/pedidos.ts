// Notas de pedido: crear desde una cotización aprobada y vigente, reservar lo disponible y cancelar liberando
// (REQ-COT-8.1–8.4, REQ-STK-7.1–7.4). La reserva y el cambio de estado van en la misma transacción.
import { asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cliente, cotizacion, cotizacionItem, notaPedido, pedidoItem } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { hoySantiago } from "../precios/dias-habiles";
import { registrarMovimientos, saldo } from "../stock";
import { pagadoDe } from "./pagos";
import { repartirReserva } from "./reserva";

export interface DatosPedido { cotizacionId: string; direccionDespacho?: string | null; medioTransporte?: string | null }

export async function crearPedido(tx: Tx, d: DatosPedido, actor: Actor & { id: string }, origen: Origen) {
  const [c] = await tx.select().from(cotizacion).where(eq(cotizacion.id, d.cotizacionId)).for("update");
  if (!c) throw new ErrorDominio("NO_ENCONTRADO", "Cotización no encontrada");
  if (c.estado === "aceptada") throw new ErrorDominio("YA_TIENE_PEDIDO", `La cotización ${c.numero} ya tiene nota de pedido.`);
  if (c.estado !== "aprobada") throw new ErrorDominio("NO_APROBADA", "Solo una cotización aprobada se convierte en pedido.");
  if (!c.vigenciaHasta || c.vigenciaHasta < hoySantiago()) throw new ErrorDominio("VENCIDA", `La cotización ${c.numero} está vencida: hay que recotizar.`);
  const [cli] = await tx.select().from(cliente).where(eq(cliente.id, c.clienteId!));

  const items = await tx.select().from(cotizacionItem).where(eq(cotizacionItem.cotizacionId, c.id)).orderBy(asc(cotizacionItem.orden));
  const p = await insertarPedido(tx, {
    cabecera: {
      cotizacionId: c.id, clienteId: c.clienteId!, origen: "cotizacion",
      direccionDespacho: d.direccionDespacho?.trim() || cli?.direccionDespacho || cli?.direccion || null,
      medioTransporte: d.medioTransporte?.trim() || null,
    },
    lineas: items.map((i) => ({ articuloId: i.articuloId, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, cantidad: i.cantidad, precioUnitario: i.precioUnitario!, totalLinea: i.totalLinea! })),
  }, actor, origen, { cotizacion: c.numero });
  await tx.update(cotizacion).set({ estado: "aceptada", version: c.version + 1, actualizadoEn: sql`now()` }).where(eq(cotizacion.id, c.id));
  return p;
}

export interface LineaPedido { articuloId: string | null; descripcion: string; medidaSolicitada: string | null; cantidad: number; precioUnitario: number; totalLinea: number }

/**
 * Núcleo común de un pedido (desde cotización o desde la nota de la tienda): bloquea los artículos antes de leer el
 * disponible (dos pedidos simultáneos no reservan lo mismo), reparte la reserva, inserta y audita (REQ-STK-7.1, 7.3).
 */
export async function insertarPedido(
  tx: Tx, d: { cabecera: Omit<typeof notaPedido.$inferInsert, "creadoPor">; lineas: LineaPedido[] },
  actor: Actor & { id: string }, origen: Origen, auditoria: Record<string, unknown> = {},
) {
  const articulos = [...new Set(d.lineas.flatMap((i) => (i.articuloId ? [i.articuloId] : [])))].sort();
  for (const a of articulos) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${a}))`);
  const disponible = new Map(await Promise.all(articulos.map(async (a) => [a, (await saldo(tx, { articuloId: a })).disponible] as const)));
  const reparto = repartirReserva(d.lineas.map((i) => ({ articuloId: i.articuloId, cantidad: i.cantidad })), disponible);

  const [p] = await tx.insert(notaPedido).values({ ...d.cabecera, creadoPor: actor.id }).returning({ id: notaPedido.id, numero: notaPedido.numero });
  await tx.insert(pedidoItem).values(d.lineas.map((i, k) => ({ notaPedidoId: p.id, orden: k + 1, ...i, ...reparto[k] })));

  const reservas = d.lineas.flatMap((i, k) => (reparto[k].reservado > 0
    ? [{ articuloId: i.articuloId!, tipo: "reserva" as const, cantidad: reparto[k].reservado, refTipo: "pedido", refId: p.id }] : []));
  if (reservas.length) await registrarMovimientos(tx, reservas, actor, origen);

  const faltante = reparto.reduce((t, r) => t + r.faltante, 0);
  await registrarAuditoria(tx, {
    actor, accion: "crear pedido", recurso: "nota_pedido", recursoId: p.id, resultado: "ok", origen,
    despues: { numero: p.numero, origen: d.cabecera.origen, ...auditoria, reservado: reparto.reduce((t, r) => t + r.reservado, 0), faltante },
  });
  return { ...p, faltante };
}

export async function cancelarPedido(tx: Tx, id: string, motivo: string, actor: Actor & { id: string }, origen: Origen) {
  if (!motivo.trim()) throw new ErrorDominio("VALIDACION", "Indica el motivo de la cancelación.");
  const [p] = await tx.select().from(notaPedido).where(eq(notaPedido.id, id)).for("update");
  if (!p) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  if (p.estado === "cancelada" || p.estado === "despachada") throw new ErrorDominio("NO_EDITABLE", `La nota de pedido ${p.numero} está ${p.estado}.`);

  const items = await tx.select().from(pedidoItem).where(eq(pedidoItem.notaPedidoId, id));
  const liberaciones = items.flatMap((i) => (i.articuloId && i.reservado > 0
    ? [{ articuloId: i.articuloId, tipo: "liberacion" as const, cantidad: -i.reservado, motivo: "cancelación del pedido", refTipo: "pedido", refId: id }] : []));
  if (liberaciones.length) await registrarMovimientos(tx, liberaciones, actor, origen);
  // Con pagos, la cancelación los conserva y deja anotado lo pagado; las devoluciones no se registran (REQ-COT-8.14).
  const pagado = await pagadoDe(tx, id);
  await tx.update(notaPedido).set({ estado: "cancelada", canceladaPor: actor.id, canceladaEn: sql`now()`, motivoCancelacion: motivo.trim() }).where(eq(notaPedido.id, id));
  await registrarAuditoria(tx, {
    actor, accion: "cancelar pedido", recurso: "nota_pedido", recursoId: id, resultado: "ok", origen,
    antes: { estado: p.estado }, despues: { estado: "cancelada", motivo: motivo.trim(), liberado: liberaciones.reduce((t, l) => t - l.cantidad, 0), ...(pagado > 0 ? { pagado } : {}) },
  });
}
