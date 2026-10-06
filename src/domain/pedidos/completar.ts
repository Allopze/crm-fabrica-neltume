// Completar la reserva de un pedido con el stock que entró después (REQ-STK-7.5): al cerrar una orden de producción
// vinculada, o a mano. Solo reserva lo disponible; nunca deja el disponible en negativo.
import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { notaPedido, pedidoItem } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { registrarMovimientos, saldo } from "../stock";

export const ESTADOS_ABIERTOS = ["pendiente", "en_produccion", "lista"] as const;

export async function completarReserva(tx: Tx, pedidoId: string, actor: Actor & { id: string }, origen: Origen) {
  const [p] = await tx.select().from(notaPedido).where(eq(notaPedido.id, pedidoId)).for("update");
  if (!p) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  if (!(ESTADOS_ABIERTOS as readonly string[]).includes(p.estado)) throw new ErrorDominio("NO_EDITABLE", `La nota de pedido ${p.numero} está ${p.estado}.`);
  const items = await tx.select().from(pedidoItem)
    .where(and(eq(pedidoItem.notaPedidoId, pedidoId), isNotNull(pedidoItem.articuloId), gt(pedidoItem.faltante, 0)));
  const articulos = [...new Set(items.map((i) => i.articuloId!))].sort();
  for (const a of articulos) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${a}))`);
  const libre = new Map(await Promise.all(articulos.map(async (a) => [a, Math.max((await saldo(tx, { articuloId: a })).disponible, 0)] as const)));

  const reservas = [];
  for (const i of items) {
    const n = Math.min(libre.get(i.articuloId!) ?? 0, i.faltante);
    if (n <= 0) continue;
    libre.set(i.articuloId!, libre.get(i.articuloId!)! - n);
    await tx.update(pedidoItem).set({ reservado: i.reservado + n, faltante: i.faltante - n }).where(eq(pedidoItem.id, i.id));
    reservas.push({ articuloId: i.articuloId!, tipo: "reserva" as const, cantidad: n, refTipo: "pedido", refId: pedidoId });
  }
  if (reservas.length) {
    await registrarMovimientos(tx, reservas, actor, origen);
    await registrarAuditoria(tx, { actor, accion: "completar reserva", recurso: "nota_pedido", recursoId: pedidoId, resultado: "ok", origen,
      despues: { numero: p.numero, reservado: reservas.reduce((t, r) => t + r.cantidad, 0) } });
  }
  return { reservado: reservas.reduce((t, r) => t + r.cantidad, 0) };
}
