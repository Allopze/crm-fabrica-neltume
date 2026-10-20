// Líneas de las facturas de compra (ADR-0021, REQ-MP-7.2–7.5): recibir una línea como recepción inmutable con su
// clave de idempotencia, y asociar o ignorar un ítem del proveedor (vale para todas sus líneas por asociar).
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { compra, compraLinea, mapeoItemCompra } from "@/db/esquema/compras";
import { materiaPrima } from "@/db/esquema/produccion";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { registrarRecepcion } from "../materias-primas";
import { decidirLinea, type MapeoLinea, normalizarUnidad } from "./mapeo";

type Usuario = Actor & { id: string };
type DatosCompra = { rutEmisor: string; tipo: number; folio: number; razonSocial: string };

/** Clave de idempotencia de la recepción de una línea: repetir una corrida no duplica stock (REQ-MP-7.5). */
export const claveRecepcion = (c: DatosCompra, nroLinea: number) => `chipax:${c.rutEmisor}:${c.tipo}:${c.folio}:${nroLinea}`;

/** Referencia legible del movimiento: «Factura 1234 · Maderas del Sur». */
export const referenciaFactura = (c: DatosCompra) => `${c.tipo === 34 ? "Factura exenta" : "Factura"} ${c.folio} · ${c.razonSocial}`.slice(0, 120);

/** Crea la recepción de una línea y devuelve el id del movimiento. */
export async function recibirLinea(tx: Tx, c: DatosCompra, nroLinea: number, d: { materiaPrimaId: string; cantidad: number }, actor: Usuario, origen: Origen) {
  const m = await registrarRecepcion(tx, { materiaPrimaId: d.materiaPrimaId, cantidad: d.cantidad, referencia: referenciaFactura(c) }, actor, origen, claveRecepcion(c, nroLinea));
  return m.id;
}

async function lineaPorAsociar(tx: Tx, lineaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(lineaId)) throw new ErrorDominio("NO_ENCONTRADO", "Línea de compra no encontrada");
  const [l] = await tx.select({ linea: compraLinea, compra }).from(compraLinea).innerJoin(compra, eq(compra.id, compraLinea.compraId))
    .where(eq(compraLinea.id, lineaId)).for("update", { of: compraLinea });
  if (!l) throw new ErrorDominio("NO_ENCONTRADO", "Línea de compra no encontrada");
  if (l.linea.estado !== "por_asociar") throw new ErrorDominio("NO_EDITABLE", "Esa línea ya no está por asociar.");
  return l;
}

/** Aplica un mapeo recién guardado a todas las líneas por asociar del mismo ítem del proveedor. */
async function aplicarMapeo(tx: Tx, rut: string, clave: string, mapeo: MapeoLinea, actor: Usuario, origen: Origen) {
  const pendientes = await tx.select({ linea: compraLinea, compra }).from(compraLinea).innerJoin(compra, eq(compra.id, compraLinea.compraId))
    .where(and(eq(compra.rutEmisor, rut), eq(compraLinea.clave, clave), eq(compraLinea.estado, "por_asociar"))).for("update", { of: compraLinea });
  const conteo = { recibidas: 0, porRevisar: 0, ignoradas: 0 };
  for (const { linea, compra: c } of pendientes) {
    const d = decidirLinea(c.tipo, { cantidad: linea.cantidad, unidad: linea.unidad }, mapeo);
    const resuelta = { resueltaPor: actor.id, resueltaEn: sql`now()` };
    if (d.estado === "recibida") {
      const movimientoId = await recibirLinea(tx, c, linea.nroLinea, d, actor, origen);
      await tx.update(compraLinea).set({ estado: "recibida", materiaPrimaId: d.materiaPrimaId, cantidadRecibida: d.cantidad, movimientoId, ...resuelta }).where(eq(compraLinea.id, linea.id));
      conteo.recibidas++;
    } else if (d.estado === "ignorada") {
      await tx.update(compraLinea).set({ estado: "ignorada", ...resuelta }).where(eq(compraLinea.id, linea.id));
      conteo.ignoradas++;
    } else if (d.estado === "por_revisar") {
      await tx.update(compraLinea).set({ estado: "por_revisar", motivoRevision: d.motivo, ...resuelta }).where(eq(compraLinea.id, linea.id));
      conteo.porRevisar++;
    }
  }
  return conteo;
}

async function guardarMapeo(tx: Tx, rut: string, clave: string, descripcion: string, v: { materiaPrimaId: string | null; factor: number | null; unidadFacturada: string | null; ignorar: boolean }, actor: Usuario) {
  const [m] = await tx.insert(mapeoItemCompra).values({ proveedorRut: rut, clave, descripcion, ...v, creadoPor: actor.id })
    .onConflictDoUpdate({ target: [mapeoItemCompra.proveedorRut, mapeoItemCompra.clave], set: { ...v, actualizadoEn: sql`now()` } }).returning({ id: mapeoItemCompra.id });
  return m.id;
}

/**
 * «Asociar y recibir» (REQ-MP-7.3): guarda el mapeo del ítem (materia prima, factor y la unidad facturada de esta
 * línea) y recibe todas sus líneas por asociar; las de otra unidad quedan por revisar.
 */
export async function asociarLinea(tx: Tx, lineaId: string, d: { materiaPrimaId: string; factor: number }, actor: Usuario, origen: Origen) {
  if (!(Number.isFinite(d.factor) && d.factor > 0 && d.factor <= 1e6)) throw new ErrorDominio("VALIDACION", "El factor debe ser un número mayor que cero.");
  const { linea, compra: c } = await lineaPorAsociar(tx, lineaId);
  const [mp] = await tx.select().from(materiaPrima).where(eq(materiaPrima.id, d.materiaPrimaId));
  if (!mp || !mp.activo) throw new ErrorDominio("VALIDACION", "Elige una materia prima activa.");
  const mapeo: MapeoLinea = { materiaPrimaId: mp.id, factor: d.factor, unidadFacturada: normalizarUnidad(linea.unidad), ignorar: false, materiaActiva: true };
  const id = await guardarMapeo(tx, c.rutEmisor, linea.clave, linea.nombreItem, mapeo, actor);
  const conteo = await aplicarMapeo(tx, c.rutEmisor, linea.clave, mapeo, actor, origen);
  await registrarAuditoria(tx, { actor, accion: "asociar item compra", recurso: "mapeo_item_compra", recursoId: id, resultado: "ok", origen,
    despues: { proveedor: c.rutEmisor, item: linea.nombreItem, materiaPrima: mp.nombre, factor: d.factor, unidad: mapeo.unidadFacturada, ...conteo } });
  return conteo;
}

/** «No es materia prima» (fletes, servicios): queda recordado y sus líneas por asociar pasan a ignoradas. */
export async function ignorarLinea(tx: Tx, lineaId: string, actor: Usuario, origen: Origen) {
  const { linea, compra: c } = await lineaPorAsociar(tx, lineaId);
  const mapeo: MapeoLinea = { materiaPrimaId: null, factor: null, unidadFacturada: null, ignorar: true };
  const id = await guardarMapeo(tx, c.rutEmisor, linea.clave, linea.nombreItem, mapeo, actor);
  const conteo = await aplicarMapeo(tx, c.rutEmisor, linea.clave, mapeo, actor, origen);
  await registrarAuditoria(tx, { actor, accion: "ignorar item compra", recurso: "mapeo_item_compra", recursoId: id, resultado: "ok", origen,
    despues: { proveedor: c.rutEmisor, item: linea.nombreItem, ...conteo } });
  return conteo;
}
