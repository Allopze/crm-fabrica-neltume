// Lectura de las compras desde Chipax (ADR-0021): por asociar, por revisar, facturas recientes y estado de la
// sincronización. El precio de compra solo con costos.ver (REQ-MP-7.10).
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { compra, compraLinea, mapeoItemCompra, proveedorCompra, sincronizacionChipax } from "@/db/esquema/compras";
import { materiaPrima } from "@/db/esquema/produccion";
import { ErrorDominio } from "../errores";

const columnasLinea = {
  id: compraLinea.id, compraId: compraLinea.compraId, nroLinea: compraLinea.nroLinea, codigoItem: compraLinea.codigoItem, nombreItem: compraLinea.nombreItem,
  cantidad: compraLinea.cantidad, unidad: compraLinea.unidad, precioUnitario: compraLinea.precioUnitario, estado: compraLinea.estado,
  motivoRevision: compraLinea.motivoRevision, cantidadRecibida: compraLinea.cantidadRecibida, materiaPrima: materiaPrima.nombre,
  folio: compra.folio, tipo: compra.tipo, fechaEmision: compra.fechaEmision, proveedor: compra.razonSocial, rutEmisor: compra.rutEmisor,
};

const sinPrecio = <T extends { precioUnitario: number | null }>(filas: T[], verCostos: boolean) =>
  filas.map((f) => ({ ...f, precioUnitario: verCostos ? f.precioUnitario : null }));

async function lineas(tx: Tx, estados: string[], verCostos: boolean, limite = 100) {
  const filas = await tx.select(columnasLinea).from(compraLinea).innerJoin(compra, eq(compra.id, compraLinea.compraId))
    .leftJoin(materiaPrima, eq(materiaPrima.id, compraLinea.materiaPrimaId))
    .where(inArray(compraLinea.estado, estados)).orderBy(desc(compra.fechaEmision), compraLinea.nroLinea).limit(limite);
  return sinPrecio(filas, verCostos);
}

export async function ultimaSincronizacion(tx: Tx) {
  const [ultima] = await tx.select().from(sincronizacionChipax).where(sql`${sincronizacionChipax.inicio} IS NOT NULL`)
    .orderBy(desc(sincronizacionChipax.inicio)).limit(1);
  // `demorada`: pendiente hace más de 2 min, señal de que el servicio de compras no está corriendo.
  const [pendiente] = await tx.select({ id: sincronizacionChipax.id, solicitadaEn: sincronizacionChipax.solicitadaEn,
    demorada: sql<boolean>`${sincronizacionChipax.solicitadaEn} < now() - interval '2 minutes'` }).from(sincronizacionChipax)
    .where(sql`${sincronizacionChipax.inicio} IS NULL`).limit(1);
  return { ultima: ultima ?? null, pendiente: pendiente ?? null };
}

/** Resumen de la pestaña Compras (Chipax): lo pendiente primero, luego las facturas recientes. */
export async function resumenCompras(tx: Tx, verCostos: boolean) {
  const [porAsociar, porRevisar, sincronizacion] = [await lineas(tx, ["por_asociar"], verCostos), await lineas(tx, ["por_revisar"], verCostos), await ultimaSincronizacion(tx)];
  const recientes = await tx.select({
    id: compra.id, tipo: compra.tipo, folio: compra.folio, fechaEmision: compra.fechaEmision, proveedor: compra.razonSocial, rutEmisor: compra.rutEmisor,
    xmlPendiente: compra.xmlPendiente, aviso: compra.aviso, estadoChipax: compra.estadoChipax,
    recibidas: sql<number>`count(*) FILTER (WHERE ${compraLinea.estado} = 'recibida')::int`,
    pendientes: sql<number>`count(*) FILTER (WHERE ${compraLinea.estado} IN ('por_asociar', 'por_revisar'))::int`,
    lineas: sql<number>`count(${compraLinea.id})::int`,
  }).from(compra).leftJoin(compraLinea, eq(compraLinea.compraId, compra.id))
    .groupBy(compra.id).orderBy(desc(compra.fechaEmision), desc(compra.folio)).limit(30);
  return { porAsociar, porRevisar, recientes, sincronizacion };
}

export async function obtenerCompra(tx: Tx, id: string, verCostos: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorDominio("NO_ENCONTRADO", "Compra no encontrada");
  const [c] = await tx.select().from(compra).where(eq(compra.id, id));
  if (!c) throw new ErrorDominio("NO_ENCONTRADO", "Compra no encontrada");
  const filas = await tx.select(columnasLinea).from(compraLinea).innerJoin(compra, eq(compra.id, compraLinea.compraId))
    .leftJoin(materiaPrima, eq(materiaPrima.id, compraLinea.materiaPrimaId)).where(eq(compraLinea.compraId, id)).orderBy(compraLinea.nroLinea);
  return { ...c, lineas: sinPrecio(filas, verCostos) };
}

/** Materias primas que ya entran solas desde Chipax, con el proveedor (aviso en Recepción manual). */
export async function materiasDesdeChipax(tx: Tx): Promise<Record<string, string>> {
  const filas = await tx.select({ id: mapeoItemCompra.materiaPrimaId, proveedor: proveedorCompra.nombre }).from(mapeoItemCompra)
    .innerJoin(proveedorCompra, eq(proveedorCompra.rut, mapeoItemCompra.proveedorRut))
    .where(and(eq(proveedorCompra.activo, true), eq(mapeoItemCompra.ignorar, false)));
  const r: Record<string, string> = {};
  for (const f of filas) if (f.id) r[f.id] = r[f.id] ? `${r[f.id]}, ${f.proveedor}` : f.proveedor;
  return r;
}
