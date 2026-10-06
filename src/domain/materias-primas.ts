// Materias primas y recepciones (REQ-MP-1, REQ-MP-2). Las existencias salen de v_stock.
import { asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { movimiento } from "@/db/esquema/inventario";
import { materiaPrima, unidad } from "@/db/esquema/produccion";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";
import { registrarMovimientos } from "./stock";

export async function listarMateriasPrimas(tx: Tx) {
  const filas = await tx
    .select({
      id: materiaPrima.id, nombre: materiaPrima.nombre, unidad: materiaPrima.unidadCodigo, unidadNombre: unidad.nombre,
      stockMinimo: materiaPrima.stockMinimo, activo: materiaPrima.activo,
      existencia: sql<string>`coalesce((SELECT sum(existencia) FROM v_stock WHERE materia_prima_id = ${materiaPrima.id}), 0)`,
      ultimaRecepcion: sql<string | null>`(SELECT max(${movimiento.ocurridoEn}) FROM ${movimiento} WHERE ${movimiento.materiaPrimaId} = ${materiaPrima.id} AND ${movimiento.tipo} = 'recepcion')`,
    })
    .from(materiaPrima)
    .innerJoin(unidad, eq(unidad.codigo, materiaPrima.unidadCodigo))
    .orderBy(asc(materiaPrima.nombre));
  return filas.map((f) => ({ ...f, existencia: Number(f.existencia), stockMinimo: f.stockMinimo === null ? null : Number(f.stockMinimo) }));
}

export async function listarUnidades(tx: Tx) {
  return tx.select().from(unidad).orderBy(asc(unidad.codigo));
}

export async function crearMateriaPrima(tx: Tx, d: { nombre: string; unidadCodigo: string; stockMinimo?: number | null }, actor: Actor, origen: Origen) {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  if (nombre.length < 2) throw new ErrorDominio("VALIDACION", "El nombre es obligatorio");
  const [u] = await tx.select().from(unidad).where(eq(unidad.codigo, d.unidadCodigo));
  if (!u) throw new ErrorDominio("VALIDACION", "Unidad de medida inexistente");
  const [repetida] = await tx.select({ id: materiaPrima.id }).from(materiaPrima).where(sql`lower(${materiaPrima.nombre}) = lower(${nombre})`);
  if (repetida) throw new ErrorDominio("VALIDACION", "Ya existe una materia prima con ese nombre");
  const [mp] = await tx.insert(materiaPrima).values({ nombre, unidadCodigo: d.unidadCodigo, stockMinimo: d.stockMinimo ?? null }).returning();
  await registrarAuditoria(tx, { actor, accion: "crear", recurso: "materia_prima", recursoId: mp.id, despues: mp, resultado: "ok", origen });
  return mp;
}

export async function actualizarMateriaPrima(tx: Tx, id: string, c: { stockMinimo?: number | null; activo?: boolean }, actor: Actor, origen: Origen) {
  const [antes] = await tx.select().from(materiaPrima).where(eq(materiaPrima.id, id));
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Materia prima no encontrada");
  const [despues] = await tx.update(materiaPrima).set(c).where(eq(materiaPrima.id, id)).returning();
  await registrarAuditoria(tx, { actor, accion: "actualizar", recurso: "materia_prima", recursoId: id, antes, despues, resultado: "ok", origen });
  return despues;
}

/** Recepción de compras: movimiento inmutable de entrada (REQ-MP-2.1). */
export async function registrarRecepcion(tx: Tx, d: { materiaPrimaId: string; cantidad: number; referencia?: string }, actor: Actor & { id: string }, origen: Origen, clave?: string) {
  if (!(d.cantidad > 0)) throw new ErrorDominio("VALIDACION", "La cantidad debe ser mayor que cero");
  const [mp] = await tx.select().from(materiaPrima).where(eq(materiaPrima.id, d.materiaPrimaId));
  if (!mp || !mp.activo) throw new ErrorDominio("NO_ENCONTRADO", "Materia prima no encontrada o inactiva");
  const [m] = await registrarMovimientos(tx, [{ materiaPrimaId: mp.id, tipo: "recepcion", cantidad: d.cantidad, refTipo: "recepcion", refId: d.referencia }], actor, origen, clave);
  return m;
}
