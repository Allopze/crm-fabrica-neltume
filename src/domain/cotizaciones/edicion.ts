// Edición de borradores (REQ-COT-3.2, 5, 6.5). Versión optimista; precios siempre desde la lista,
// salvo el precio de un ítem "a pedido", que fija una persona (REQ-COT-2.5; SECURITY T2).
import { and, eq, max, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo, madera, modelo } from "@/db/esquema/catalogo";
import { cotizacion, cotizacionItem } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { calcularLinea } from "../precios/calcular";
import { listaVigenteId, precioDeArticulo, recalcularTotales } from "./calculo";

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
const MADERA: Record<string, string> = { "PINO OREGON": "Pino Oregón", RAULI: "Raulí", LENGA: "Lenga", MARA: "Mara" };

/** Bloquea la cotización, verifica que sea editable y la versión vigente, y sube la versión. */
export async function tomarBorrador(tx: Tx, id: string, version: number) {
  const [c] = await tx.select().from(cotizacion).where(eq(cotizacion.id, id)).for("update");
  if (!c) throw new ErrorDominio("NO_ENCONTRADO", "Cotización no encontrada");
  if (c.estado !== "borrador" && c.estado !== "ia_fallida") throw new ErrorDominio("NO_EDITABLE", `La cotización ${c.numero} está ${c.estado}: no se puede editar.`);
  if (c.version !== version) throw new ErrorDominio("VERSION_OBSOLETA", "Otra persona cambió esta cotización. Recarga para ver la versión actual.");
  const listaId = c.listaId ?? (await listaVigenteId(tx));
  await tx.update(cotizacion).set({ version: c.version + 1, estado: "borrador", listaId, actualizadoEn: sql`now()` }).where(eq(cotizacion.id, id));
  return { ...c, listaId };
}

export async function articuloConDescripcion(tx: Tx, codigo: string) {
  const [a] = await tx.select({ id: articulo.id, codigo: articulo.codigo, modelo: modelo.nombre, madera: madera.nombre, ancho: articulo.anchoEtiqueta, altoM: articulo.altoM })
    .from(articulo).innerJoin(modelo, eq(modelo.id, articulo.modeloId)).innerJoin(madera, eq(madera.id, articulo.maderaId))
    .where(and(eq(articulo.codigo, codigo.trim().toUpperCase()), eq(articulo.activo, true)));
  if (!a) throw new ErrorDominio("VALIDACION", `El artículo ${codigo} no existe en el catálogo`);
  return { ...a, descripcion: `${titulo(a.modelo)} · ${MADERA[a.madera] ?? a.madera} · ${a.ancho} × ${Number(a.altoM).toFixed(2).replace(".", ",")} m` };
}

async function lineaConPrecio(tx: Tx, codigo: string, cantidad: number, listaId: string) {
  const a = await articuloConDescripcion(tx, codigo);
  const p = await precioDeArticulo(tx, a.id, listaId);
  return { articuloId: a.id, descripcion: a.descripcion, precioNetoLista: p.precioNetoLista, recargoPct: p.recargoPct, precioUnitario: p.precioUnitario,
    totalLinea: calcularLinea({ precioNetoLista: p.precioNetoLista, recargoPct: p.recargoPct, cantidad }).totalLinea };
}

export async function agregarItem(tx: Tx, id: string, d: { codigo: string; cantidad: number }, version: number, actor: Actor & { id: string }, origen: Origen) {
  const c = await tomarBorrador(tx, id, version);
  const [{ ultimo }] = await tx.select({ ultimo: max(cotizacionItem.orden) }).from(cotizacionItem).where(eq(cotizacionItem.cotizacionId, id));
  const linea = await lineaConPrecio(tx, d.codigo, d.cantidad, c.listaId);
  const [item] = await tx.insert(cotizacionItem).values({ cotizacionId: id, orden: (ultimo ?? 0) + 1, cantidad: d.cantidad, estadoItem: "ok", ...linea, modificadoPor: actor.id, modificadoEn: sql`now()` }).returning();
  await recalcularTotales(tx, id);
  await registrarAuditoria(tx, { actor, accion: "agregar ítem", recurso: "cotizacion", recursoId: id, despues: { item: item.id, codigo: d.codigo, cantidad: d.cantidad }, resultado: "ok", origen });
}

export interface CambioItem { codigo?: string; cantidad?: number; precioUnitario?: number }

export async function cambiarItem(tx: Tx, id: string, itemId: string, cambio: CambioItem, version: number, actor: Actor & { id: string }, origen: Origen) {
  const c = await tomarBorrador(tx, id, version);
  const [antes] = await tx.select().from(cotizacionItem).where(and(eq(cotizacionItem.id, itemId), eq(cotizacionItem.cotizacionId, id)));
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Ítem no encontrado");
  const cantidad = cambio.cantidad ?? antes.cantidad;
  let nuevo: Partial<typeof cotizacionItem.$inferInsert> = { cantidad };

  if (cambio.precioUnitario !== undefined) {
    // Solo un ítem a pedido admite un precio fijado por una persona (SECURITY T2).
    if (antes.estadoItem !== "a_pedido" && !(antes.estadoItem === "ok" && antes.fijadoPor)) {
      throw new ErrorDominio("CAMPO_NO_PERMITIDO", "Solo se puede fijar el precio de un ítem a pedido.");
    }
    if (!Number.isInteger(cambio.precioUnitario) || cambio.precioUnitario <= 0) throw new ErrorDominio("VALIDACION", "El precio debe ser un entero positivo en pesos.");
    nuevo = { ...nuevo, estadoItem: "ok", precioUnitario: cambio.precioUnitario, totalLinea: cambio.precioUnitario * cantidad, fijadoPor: actor.id, duda: null };
  } else if (cambio.codigo) {
    nuevo = { ...nuevo, ...(await lineaConPrecio(tx, cambio.codigo, cantidad, c.listaId)), estadoItem: "ok", duda: null, fijadoPor: null, referenciaCodigo: null, precioReferencia: null };
  } else if (antes.estadoItem === "ok" && antes.precioUnitario !== null) {
    nuevo = { ...nuevo, totalLinea: Number(antes.precioUnitario) * cantidad };
  }

  await tx.update(cotizacionItem).set({ ...nuevo, modificadoPor: actor.id, modificadoEn: sql`now()` }).where(eq(cotizacionItem.id, itemId));
  await recalcularTotales(tx, id);
  await registrarAuditoria(tx, {
    actor, accion: cambio.precioUnitario !== undefined ? "fijar precio a pedido" : cambio.codigo ? "resolver ítem" : "editar ítem",
    recurso: "cotizacion", recursoId: id, resultado: "ok", origen,
    antes: { item: itemId, estado: antes.estadoItem, cantidad: antes.cantidad, precioUnitario: antes.precioUnitario },
    despues: { item: itemId, ...cambio },
  });
}

export async function eliminarItem(tx: Tx, id: string, itemId: string, version: number, actor: Actor & { id: string }, origen: Origen) {
  await tomarBorrador(tx, id, version);
  const borrados = await tx.delete(cotizacionItem).where(and(eq(cotizacionItem.id, itemId), eq(cotizacionItem.cotizacionId, id))).returning();
  if (!borrados.length) throw new ErrorDominio("NO_ENCONTRADO", "Ítem no encontrado");
  await recalcularTotales(tx, id);
  await registrarAuditoria(tx, { actor, accion: "quitar ítem", recurso: "cotizacion", recursoId: id, antes: { item: itemId, descripcion: borrados[0].descripcion, textoFuente: borrados[0].textoFuente }, resultado: "ok", origen });
}

export async function actualizarCabecera(tx: Tx, id: string, d: { clienteId?: string | null; notas?: string | null }, version: number, actor: Actor & { id: string }, origen: Origen) {
  const c = await tomarBorrador(tx, id, version);
  await tx.update(cotizacion).set(d).where(eq(cotizacion.id, id));
  await registrarAuditoria(tx, { actor, accion: "editar cabecera", recurso: "cotizacion", recursoId: id, antes: { clienteId: c.clienteId, notas: c.notas }, despues: d, resultado: "ok", origen });
}

/** Pasa el borrador a la lista vigente y recalcula sus precios (REQ-COT-6.3). Los precios fijados a mano se conservan. */
export async function recalcularConListaVigente(tx: Tx, id: string, version: number, actor: Actor & { id: string }, origen: Origen) {
  const c = await tomarBorrador(tx, id, version);
  const vigente = await listaVigenteId(tx);
  const items = await tx.select().from(cotizacionItem).where(eq(cotizacionItem.cotizacionId, id));
  for (const i of items) {
    if (i.articuloId && !i.fijadoPor) {
      const p = await precioDeArticulo(tx, i.articuloId, vigente);
      await tx.update(cotizacionItem).set({ precioNetoLista: p.precioNetoLista, recargoPct: p.recargoPct, precioUnitario: p.precioUnitario, totalLinea: p.precioUnitario * i.cantidad }).where(eq(cotizacionItem.id, i.id));
    } else if (i.estadoItem === "a_pedido" && i.referenciaCodigo) {
      const ref = await articuloConDescripcion(tx, i.referenciaCodigo);
      await tx.update(cotizacionItem).set({ precioReferencia: (await precioDeArticulo(tx, ref.id, vigente)).precioUnitario }).where(eq(cotizacionItem.id, i.id));
    }
  }
  await tx.update(cotizacion).set({ listaId: vigente }).where(eq(cotizacion.id, id));
  const totales = await recalcularTotales(tx, id);
  await registrarAuditoria(tx, { actor, accion: "recalcular", recurso: "cotizacion", recursoId: id, antes: { listaId: c.listaId }, despues: { listaId: vigente, ...totales }, resultado: "ok", origen });
}
