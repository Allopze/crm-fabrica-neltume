// Listas de materiales (REQ-MP-3). Cada edición crea una versión nueva; vale la más reciente y más específica.
// Una línea puede ser la «madera de la puerta» (REQ-MP-3.4, ADR-0012): se resuelve al cerrar con la madera y las
// pulgadas de cada artículo, así una receta sirve para las cuatro maderas.
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { madera, modelo } from "@/db/esquema/catalogo";
import { bom, bomLinea, maderaInsumo, materiaPrima } from "@/db/esquema/produccion";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";

export interface DefinicionBom {
  modeloCodigo: string;
  anchoCodigo?: string | null;
  altoCodigo?: string | null;
  origen: "real" | "demo";
  /** Insumo con cantidad por puerta, o `maderaPuerta` con `cantidad` = factor sobre las pulgadas del artículo. */
  lineas: { materiaPrimaId?: string | null; maderaPuerta?: boolean; cantidad: number }[];
}

export async function definirBom(tx: Tx, d: DefinicionBom, actor: Actor & { id: string }, origen: Origen) {
  const [m] = await tx.select().from(modelo).where(eq(modelo.codigo, d.modeloCodigo.toUpperCase()));
  if (!m) throw new ErrorDominio("VALIDACION", `Modelo ${d.modeloCodigo} inexistente`);
  if (!d.lineas.length) throw new ErrorDominio("VALIDACION", "El BOM necesita al menos una línea");
  if (d.lineas.some((l) => !(l.cantidad > 0))) throw new ErrorDominio("VALIDACION", "Las cantidades deben ser mayores que cero");
  if (d.lineas.some((l) => Boolean(l.maderaPuerta) === Boolean(l.materiaPrimaId))) {
    throw new ErrorDominio("VALIDACION", "Cada línea es un insumo o la madera de la puerta, no ambos");
  }
  if (d.lineas.filter((l) => l.maderaPuerta).length > 1) throw new ErrorDominio("VALIDACION", "La madera de la puerta aparece dos veces");
  const ids = d.lineas.flatMap((l) => (l.materiaPrimaId ? [l.materiaPrimaId] : []));
  if (new Set(ids).size !== ids.length) throw new ErrorDominio("VALIDACION", "Una materia prima aparece dos veces");
  const existentes = ids.length ? await tx.select({ id: materiaPrima.id }).from(materiaPrima).where(inArray(materiaPrima.id, ids)) : [];
  if (existentes.length !== ids.length) throw new ErrorDominio("VALIDACION", "Alguna materia prima no existe");

  const [nuevo] = await tx.insert(bom).values({
    modeloId: m.id, anchoCodigo: d.anchoCodigo || null, altoCodigo: d.altoCodigo || null, origen: d.origen, creadoPor: actor.id,
  }).returning();
  await tx.insert(bomLinea).values(d.lineas.map((l) => ({ bomId: nuevo.id, materiaPrimaId: l.materiaPrimaId ?? null, maderaPuerta: Boolean(l.maderaPuerta), cantidad: l.cantidad })));
  await registrarAuditoria(tx, { actor, accion: "definir bom", recurso: "bom", recursoId: nuevo.id, despues: { modelo: m.codigo, medida: [d.anchoCodigo, d.altoCodigo], origen: d.origen, lineas: d.lineas }, resultado: "ok", origen });
  return nuevo;
}

/** BOM vigente para un artículo: primero el de su medida exacta, si no, el general del modelo. */
export async function bomVigentePara(tx: Tx, a: { modeloId: string; anchoCodigo: string; altoCodigo: string }) {
  for (const exacto of [true, false]) {
    const [b] = await tx.select().from(bom).where(and(
      eq(bom.modeloId, a.modeloId),
      exacto ? and(eq(bom.anchoCodigo, a.anchoCodigo), eq(bom.altoCodigo, a.altoCodigo)) : and(isNull(bom.anchoCodigo), isNull(bom.altoCodigo)),
    )).orderBy(desc(bom.vigenteDesde)).limit(1);
    if (b) return { ...b, lineas: await tx.select().from(bomLinea).where(eq(bomLinea.bomId, b.id)) };
  }
  return null;
}

/** Última versión de cada BOM (modelo + medida), con nombres de materias primas. */
export async function listarBoms(tx: Tx) {
  const vigentes = await tx.execute<{ id: string }>(sql`
    SELECT DISTINCT ON (modelo_id, coalesce(ancho_codigo, ''), coalesce(alto_codigo, '')) id
    FROM bom ORDER BY modelo_id, coalesce(ancho_codigo, ''), coalesce(alto_codigo, ''), vigente_desde DESC`);
  const ids = vigentes.rows.map((r) => r.id);
  if (!ids.length) return [];
  const filas = await tx
    .select({ id: bom.id, modelo: modelo.nombre, modeloCodigo: modelo.codigo, ancho: bom.anchoCodigo, alto: bom.altoCodigo, origen: bom.origen,
      vigenteDesde: bom.vigenteDesde, lineaId: bomLinea.id, maderaPuerta: bomLinea.maderaPuerta, mpId: materiaPrima.id, mp: materiaPrima.nombre,
      unidad: materiaPrima.unidadCodigo, cantidad: bomLinea.cantidad })
    .from(bom)
    .innerJoin(modelo, eq(modelo.id, bom.modeloId))
    .innerJoin(bomLinea, eq(bomLinea.bomId, bom.id))
    .leftJoin(materiaPrima, eq(materiaPrima.id, bomLinea.materiaPrimaId))
    .where(inArray(bom.id, ids))
    .orderBy(modelo.nombre, desc(bomLinea.maderaPuerta), materiaPrima.nombre);
  type Linea = { id: string; maderaPuerta: boolean; mpId: string | null; mp: string; unidad: string; cantidad: number };
  const mapa = new Map<string, { id: string; modelo: string; modeloCodigo: string; ancho: string | null; alto: string | null; origen: string; lineas: Linea[] }>();
  for (const f of filas) {
    const b = mapa.get(f.id) ?? { id: f.id, modelo: f.modelo, modeloCodigo: f.modeloCodigo, ancho: f.ancho, alto: f.alto, origen: f.origen, lineas: [] };
    b.lineas.push(f.maderaPuerta
      ? { id: f.lineaId, maderaPuerta: true, mpId: null, mp: "Madera de la puerta", unidad: "× pulgadas del artículo", cantidad: Number(f.cantidad) }
      : { id: f.lineaId, maderaPuerta: false, mpId: f.mpId, mp: f.mp ?? "?", unidad: f.unidad ?? "", cantidad: Number(f.cantidad) });
    mapa.set(f.id, b);
  }
  return [...mapa.values()];
}

/** Cada madera con la materia prima de la que se descuenta la «madera de la puerta» (REQ-MP-3.5). */
export async function maderasConInsumo(tx: Tx) {
  return tx.select({ codigo: madera.codigo, nombre: madera.nombre, materiaPrimaId: maderaInsumo.materiaPrimaId, materiaPrima: materiaPrima.nombre })
    .from(madera).leftJoin(maderaInsumo, eq(maderaInsumo.maderaId, madera.id)).leftJoin(materiaPrima, eq(materiaPrima.id, maderaInsumo.materiaPrimaId))
    .orderBy(asc(madera.nombre));
}

/** Asocia (o desasocia, con null) la materia prima de una madera. Auditado (REQ-MP-3.5). */
export async function asociarMaderaInsumo(tx: Tx, maderaCodigo: string, materiaPrimaId: string | null, actor: Actor & { id: string }, origen: Origen) {
  const [m] = await tx.select().from(madera).where(eq(madera.codigo, maderaCodigo.toUpperCase()));
  if (!m) throw new ErrorDominio("NO_ENCONTRADO", `Madera ${maderaCodigo} inexistente`);
  const [antes] = await tx.select().from(maderaInsumo).where(eq(maderaInsumo.maderaId, m.id));
  if (materiaPrimaId) {
    const [mp] = await tx.select().from(materiaPrima).where(eq(materiaPrima.id, materiaPrimaId));
    if (!mp) throw new ErrorDominio("VALIDACION", "La materia prima no existe");
    await tx.insert(maderaInsumo).values({ maderaId: m.id, materiaPrimaId })
      .onConflictDoUpdate({ target: maderaInsumo.maderaId, set: { materiaPrimaId, actualizadoEn: sql`now()` } });
  } else {
    await tx.delete(maderaInsumo).where(eq(maderaInsumo.maderaId, m.id));
  }
  await registrarAuditoria(tx, {
    actor, accion: "asociar madera", recurso: "madera_insumo", recursoId: m.id, origen, resultado: "ok",
    antes: { materiaPrimaId: antes?.materiaPrimaId ?? null }, despues: { madera: m.nombre, materiaPrimaId },
  });
}
