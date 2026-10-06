// Precios y totales de una cotización, siempre desde la lista (REQ-COT-1.2, 2.2). La IA no aporta importes.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo, listaPrecio, precio, recargoTipo } from "@/db/esquema/catalogo";
import { cotizacion, cotizacionItem } from "@/db/esquema/comercial";
import { ErrorDominio } from "../errores";
import { calcularLinea, calcularTotales } from "../precios/calcular";

export async function listaVigenteId(tx: Tx): Promise<string> {
  const [l] = await tx.select({ id: listaPrecio.id }).from(listaPrecio).where(eq(listaPrecio.vigente, true));
  if (!l) throw new ErrorDominio("VALIDACION", "No hay lista de precios vigente: importa el Excel primero.");
  return l.id;
}

/** Precio neto de lista, recargo por tipo y unitario redondeado de un artículo en una versión de lista. */
export async function precioDeArticulo(tx: Tx, articuloId: string, listaId: string) {
  const [fila] = await tx
    .select({ neto: precio.precioNeto, tipo: articulo.tipoPuertaId })
    .from(precio).innerJoin(articulo, eq(articulo.id, precio.articuloId))
    .where(and(eq(precio.listaId, listaId), eq(precio.articuloId, articuloId)));
  if (!fila) throw new ErrorDominio("VALIDACION", "El artículo no tiene precio en la lista vigente");
  const [r] = await tx.select({ pct: recargoTipo.porcentaje }).from(recargoTipo)
    .where(and(eq(recargoTipo.listaId, listaId), fila.tipo ? eq(recargoTipo.tipoPuertaId, fila.tipo) : isNull(recargoTipo.tipoPuertaId)));
  const recargoPct = Number(r?.pct ?? 0);
  const { precioUnitario } = calcularLinea({ precioNetoLista: Number(fila.neto), recargoPct, cantidad: 1 });
  return { precioNetoLista: Number(fila.neto), recargoPct, precioUnitario };
}

/** Recalcula subtotal, descuento, IVA y total con las líneas "ok" (las demás aún no tienen precio). */
export async function recalcularTotales(tx: Tx, cotizacionId: string) {
  const [c] = await tx.select({ descuentoPct: cotizacion.descuentoPct }).from(cotizacion).where(eq(cotizacion.id, cotizacionId));
  const lineas = await tx.select({ total: cotizacionItem.totalLinea }).from(cotizacionItem)
    .where(and(eq(cotizacionItem.cotizacionId, cotizacionId), eq(cotizacionItem.estadoItem, "ok")));
  const t = calcularTotales(lineas.map((l) => Number(l.total)), Number(c.descuentoPct));
  await tx.update(cotizacion).set({ ...t, actualizadoEn: sql`now()` }).where(eq(cotizacion.id, cotizacionId));
  return t;
}
