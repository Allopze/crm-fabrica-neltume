// Ciclo de la nota de pedido (REQ-COT-8.5, REQ-STK-4.4): pendiente → en producción → lista → despachada.
// Despachar libera la reserva y descuenta el stock en la misma transacción (salida_despacho), nunca editando saldos.
import { and, eq, gt, isNotNull, type SQL, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { notaPedido, pedidoItem } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { crearOrden } from "../ordenes";
import { registrarMovimientos } from "../stock";
import { ESTADOS_ABIERTOS } from "./completar";

type Usuario = Actor & { id: string };

async function tomar(tx: Tx, id: string, permitidos: readonly string[]) {
  const [p] = await tx.select().from(notaPedido).where(eq(notaPedido.id, id)).for("update");
  if (!p) throw new ErrorDominio("NO_ENCONTRADO", "Nota de pedido no encontrada");
  if (!permitidos.includes(p.estado)) throw new ErrorDominio("NO_EDITABLE", `La nota de pedido ${p.numero} está ${p.estado}.`);
  return p;
}

async function cambiarEstado(tx: Tx, p: { id: string; numero: number; estado: string }, estado: string, extra: Record<string, SQL | string>, actor: Usuario, origen: Origen, detalle: object = {}) {
  await tx.update(notaPedido).set({ estado, ...extra }).where(eq(notaPedido.id, p.id));
  await registrarAuditoria(tx, { actor, accion: `pedido ${estado.replace("_", " ")}`, recurso: "nota_pedido", recursoId: p.id, resultado: "ok", origen,
    antes: { estado: p.estado }, despues: { estado, numero: p.numero, ...detalle } });
}

/** Pasa a producción y crea la orden de producción por lo que falta de artículos de catálogo (si falta algo). */
export async function pasarAProduccion(tx: Tx, id: string, actor: Usuario, origen: Origen) {
  const p = await tomar(tx, id, ["pendiente"]);
  const faltan = await tx.select({ codigo: articulo.codigo, faltante: pedidoItem.faltante }).from(pedidoItem)
    .innerJoin(articulo, eq(articulo.id, pedidoItem.articuloId)).where(and(eq(pedidoItem.notaPedidoId, id), gt(pedidoItem.faltante, 0)));
  const porCodigo = new Map<string, number>();
  for (const f of faltan) porCodigo.set(f.codigo, (porCodigo.get(f.codigo) ?? 0) + f.faltante);
  const orden = porCodigo.size
    ? await crearOrden(tx, { lineas: [...porCodigo].map(([codigo, cantidad]) => ({ codigo, cantidad })), observacion: `Faltante de la nota de pedido ${p.numero}`, notaPedidoId: id }, actor, origen)
    : null;
  await cambiarEstado(tx, p, "en_produccion", {}, actor, origen, { orden: orden?.numero ?? null });
  return { orden: orden ? { id: orden.id, numero: orden.numero } : null };
}

/** Lista para despacho: todo lo de catálogo reservado; los ítems a pedido (sin artículo) los confirma una persona. */
export async function marcarLista(tx: Tx, id: string, confirmarAPedido: boolean, actor: Usuario, origen: Origen) {
  const p = await tomar(tx, id, ["pendiente", "en_produccion"]);
  const items = await tx.select().from(pedidoItem).where(eq(pedidoItem.notaPedidoId, id));
  const sinStock = items.filter((i) => i.articuloId && i.faltante > 0);
  if (sinStock.length) throw new ErrorDominio("STOCK_INSUFICIENTE", `Faltan ${sinStock.reduce((t, i) => t + i.faltante, 0)} unidades por reservar: cierra la producción o completa la reserva.`);
  const aPedido = items.filter((i) => !i.articuloId);
  if (aPedido.length && !confirmarAPedido) throw new ErrorDominio("VALIDACION", "Confirma que los ítems a pedido están fabricados.");
  await cambiarEstado(tx, p, "lista", { listaEn: sql`now()` }, actor, origen, { aPedidoConfirmados: aPedido.length });
}

/** Despacho: libera lo reservado y descuenta la existencia (salida_despacho) de cada artículo, todo o nada. */
export async function despachar(tx: Tx, id: string, actor: Usuario, origen: Origen) {
  const p = await tomar(tx, id, ["lista"]);
  const items = await tx.select().from(pedidoItem).where(and(eq(pedidoItem.notaPedidoId, id), isNotNull(pedidoItem.articuloId)));
  const movs = items.flatMap((i) => [
    ...(i.reservado > 0 ? [{ articuloId: i.articuloId!, tipo: "liberacion" as const, cantidad: -i.reservado, motivo: "despacho del pedido", refTipo: "pedido", refId: id }] : []),
    { articuloId: i.articuloId!, tipo: "salida_despacho" as const, cantidad: -i.cantidad, refTipo: "pedido", refId: id },
  ]);
  if (movs.length) await registrarMovimientos(tx, movs, actor, origen);
  await cambiarEstado(tx, p, "despachada", { despachadaEn: sql`now()`, despachadaPor: actor.id }, actor, origen,
    { unidades: items.reduce((t, i) => t + i.cantidad, 0) });
}

export interface DatosDespacho { direccionDespacho?: string | null; medioTransporte?: string | null; entregaComprometida?: string | null; observaciones?: string | null }

/** Datos de despacho y entrega comprometida, editables mientras el pedido no se despache ni se cancele. */
export async function actualizarDespacho(tx: Tx, id: string, d: DatosDespacho, actor: Usuario, origen: Origen) {
  const p = await tomar(tx, id, ESTADOS_ABIERTOS);
  const limpio = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]));
  if (!Object.keys(limpio).length) throw new ErrorDominio("VALIDACION", "No hay cambios.");
  await tx.update(notaPedido).set(limpio).where(eq(notaPedido.id, id));
  const antes = Object.fromEntries(Object.keys(limpio).map((k) => [k, p[k as keyof typeof p]]));
  await registrarAuditoria(tx, { actor, accion: "editar despacho", recurso: "nota_pedido", recursoId: id, antes, despues: limpio, resultado: "ok", origen });
}

