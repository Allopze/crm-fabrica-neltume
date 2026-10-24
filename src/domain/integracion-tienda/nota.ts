// Alta y reemplazo de la nota de pedido de la fábrica desde una nota de la tienda (ADR-0023 §4, §5). La usan la
// recepción automática y la persona que aplica una revisión pendiente: el núcleo es `insertarPedido`, el mismo de una
// nota desde cotización o desde el PDF (reserva lo disponible y audita).
import { and, count, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cliente, notaPedido } from "@/db/esquema/comercial";
import { recepcionTienda } from "@/db/esquema/integracion";
import { ordenProduccion } from "@/db/esquema/produccion";
import { usuario } from "@/db/esquema/seguridad";
import { type Actor, type Origen } from "../auditoria";
import { USUARIO_INTEGRACION } from "../auth/permisos";
import { listaVigenteId } from "../cotizaciones/calculo";
import { pagadoDe } from "../pedidos/pagos";
import { insertarPedido } from "../pedidos/pedidos";
import { normalizarRut } from "../rut";
import type { PayloadConservado, PedidoTienda } from "./contrato";
import { lineasDelPedido } from "./lineas";

export class ErrorIntegracion extends Error {
  constructor(public readonly http: number, public readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "ErrorIntegracion";
  }
}

const noConfigurada = (mensaje: string) => new ErrorIntegracion(503, "not_configured", mensaje);

/** Usuario técnico que firma lo que llega por la API (ADR-0023 §5); en la auditoría va como `sistema`. */
export async function actorIntegracion(tx: Tx): Promise<Actor & { id: string }> {
  const [u] = await tx.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, USUARIO_INTEGRACION.email));
  if (!u) throw noConfigurada("Falta el usuario técnico de la integración: ejecuta las migraciones.");
  return { tipo: "sistema", id: u.id };
}

/** El cliente de tipo tienda configurado en INTEGRACION_TIENDA_CLIENTE_RUT. */
export async function clienteTienda(tx: Tx, rut: string | null): Promise<string> {
  const normal = rut ? normalizarRut(rut) : null;
  const [c] = normal ? await tx.select({ id: cliente.id, tipo: cliente.tipo }).from(cliente).where(eq(cliente.rut, normal)) : [];
  if (!c || c.tipo !== "tienda") throw noConfigurada("INTEGRACION_TIENDA_CLIENTE_RUT no corresponde a un cliente de tipo tienda.");
  return c.id;
}

export interface NotaVigente { id: string; numero: number; estado: string; origen: string }

/**
 * La nota de la fábrica que hoy representa el pedido de la tienda: la de su recepción más reciente con nota, o, si
 * nunca llegó por la API, la cargada en PDF con el mismo número (ADR-0008). Una cancelada no cuenta como vigente.
 */
export async function notaVigente(tx: Tx, sourceOrderId: string, clienteId: string, numeroNota: string): Promise<NotaVigente | null> {
  const [r] = await tx.select({ id: notaPedido.id, numero: notaPedido.numero, estado: notaPedido.estado, origen: notaPedido.origen })
    .from(recepcionTienda).innerJoin(notaPedido, eq(notaPedido.id, recepcionTienda.notaPedidoId))
    .where(and(eq(recepcionTienda.sourceOrderId, sourceOrderId), isNotNull(recepcionTienda.notaPedidoId), inArray(recepcionTienda.estado, ["incorporada", "aplicada"])))
    .orderBy(desc(recepcionTienda.revision)).limit(1);
  if (r) return r.estado === "cancelada" ? null : r;
  const [pdf] = await tx.select({ id: notaPedido.id, numero: notaPedido.numero, estado: notaPedido.estado, origen: notaPedido.origen }).from(notaPedido)
    .where(and(eq(notaPedido.clienteId, clienteId), eq(notaPedido.refExterna, numeroNota), eq(notaPedido.origen, "nota_tienda"), ne(notaPedido.estado, "cancelada")));
  return pdf ?? null;
}

/** Se reemplaza o cancela sola solo si la fábrica no empezó: pendiente, sin pagos y sin orden de producción (D2, D5). */
export async function sinIniciar(tx: Tx, n: NotaVigente): Promise<boolean> {
  if (n.estado !== "pendiente" || (await pagadoDe(tx, n.id)) !== 0) return false;
  const [{ ordenes }] = await tx.select({ ordenes: count() }).from(ordenProduccion).where(eq(ordenProduccion.notaPedidoId, n.id));
  return ordenes === 0;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface DatosNota {
  sourceOrderId: string; revision: number;
  order: Pick<PedidoTienda, "orderNumber" | "items" | "delivery" | "notes"> & { project: string | null };
  comercial: Pick<PedidoTienda["commercial"], "lines">;
}

export function datosDesdePayload(p: PayloadConservado, comercial: unknown): DatosNota {
  if (!("order" in p)) throw new Error("La recepción no trae un pedido.");
  const o = p.order;
  return { sourceOrderId: p.sourceOrderId, revision: p.sourceOrderRevision, order: { ...o, project: o.customer.project }, comercial: (comercial as DatosNota["comercial"]) ?? { lines: [] } };
}

/** Crea la nota de pedido de la fábrica (pendiente, con su reserva). Nada se produce ni se aprueba solo. */
export async function crearNotaTienda(tx: Tx, d: DatosNota, clienteId: string, actor: Actor & { id: string }, origen: Origen, reemplazaId: string | null = null) {
  let listaId: string;
  try {
    listaId = await listaVigenteId(tx);
  } catch {
    throw noConfigurada("No hay lista de precios vigente en la fábrica.");
  }
  const o = d.order;
  const lineas = await lineasDelPedido(tx, { items: o.items, commercial: d.comercial }, listaId);
  const entrega = o.delivery.committedDelivery?.trim() ?? "";
  const observaciones = [
    o.notes.trim(),
    o.delivery.destination?.trim() ? `Destino: ${o.delivery.destination.trim()}` : "",
    entrega && !FECHA.test(entrega) ? `Entrega acordada con la tienda: ${entrega}` : "",
  ].filter(Boolean).join("\n") || null;
  const p = await insertarPedido(tx, {
    cabecera: {
      cotizacionId: null, clienteId, origen: "tienda_api", refExterna: o.orderNumber, revisionExterna: d.revision, reemplazaId,
      proyecto: o.project?.trim() || null, direccionDespacho: o.delivery.address?.trim() || null, medioTransporte: o.delivery.carrier?.trim() || null,
      entregaComprometida: FECHA.test(entrega) ? entrega : null, observaciones,
    },
    lineas: lineas.map((l) => ({ articuloId: l.articuloId, descripcion: l.descripcion, medidaSolicitada: l.medidaSolicitada, cantidad: l.cantidad,
      precioUnitario: l.precioUnitario, totalLinea: l.totalLinea, observacion: l.observacion, revisar: l.revisar, referencias: l.referencias })),
  }, actor, origen, { notaTienda: o.orderNumber, revision: d.revision, sourceOrderId: d.sourceOrderId, porRevisar: lineas.filter((l) => l.revisar).length });
  return { ...p, avisos: lineas.flatMap((l) => l.avisos) };
}
