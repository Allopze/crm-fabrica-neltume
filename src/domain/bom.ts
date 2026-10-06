// Listas de materiales (REQ-MP-3). Cada edición crea una versión nueva; vale la más reciente y más específica.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { modelo } from "@/db/esquema/catalogo";
import { bom, bomLinea, materiaPrima } from "@/db/esquema/produccion";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";

export interface DefinicionBom {
  modeloCodigo: string;
  anchoCodigo?: string | null;
  altoCodigo?: string | null;
  origen: "real" | "demo";
  lineas: { materiaPrimaId: string; cantidad: number }[];
}

export async function definirBom(tx: Tx, d: DefinicionBom, actor: Actor & { id: string }, origen: Origen) {
  const [m] = await tx.select().from(modelo).where(eq(modelo.codigo, d.modeloCodigo.toUpperCase()));
  if (!m) throw new ErrorDominio("VALIDACION", `Modelo ${d.modeloCodigo} inexistente`);
  if (!d.lineas.length) throw new ErrorDominio("VALIDACION", "El BOM necesita al menos una materia prima");
  if (d.lineas.some((l) => !(l.cantidad > 0))) throw new ErrorDominio("VALIDACION", "Las cantidades deben ser mayores que cero");
  const ids = [...new Set(d.lineas.map((l) => l.materiaPrimaId))];
  if (ids.length !== d.lineas.length) throw new ErrorDominio("VALIDACION", "Una materia prima aparece dos veces");
  const existentes = await tx.select({ id: materiaPrima.id }).from(materiaPrima).where(inArray(materiaPrima.id, ids));
  if (existentes.length !== ids.length) throw new ErrorDominio("VALIDACION", "Alguna materia prima no existe");

  const [nuevo] = await tx.insert(bom).values({
    modeloId: m.id, anchoCodigo: d.anchoCodigo || null, altoCodigo: d.altoCodigo || null, origen: d.origen, creadoPor: actor.id,
  }).returning();
  await tx.insert(bomLinea).values(d.lineas.map((l) => ({ bomId: nuevo.id, materiaPrimaId: l.materiaPrimaId, cantidad: l.cantidad })));
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
      vigenteDesde: bom.vigenteDesde, mpId: materiaPrima.id, mp: materiaPrima.nombre, unidad: materiaPrima.unidadCodigo, cantidad: bomLinea.cantidad })
    .from(bom)
    .innerJoin(modelo, eq(modelo.id, bom.modeloId))
    .innerJoin(bomLinea, eq(bomLinea.bomId, bom.id))
    .innerJoin(materiaPrima, eq(materiaPrima.id, bomLinea.materiaPrimaId))
    .where(inArray(bom.id, ids))
    .orderBy(modelo.nombre);
  const mapa = new Map<string, { id: string; modelo: string; modeloCodigo: string; ancho: string | null; alto: string | null; origen: string; lineas: { mpId: string; mp: string; unidad: string; cantidad: number }[] }>();
  for (const f of filas) {
    const b = mapa.get(f.id) ?? { id: f.id, modelo: f.modelo, modeloCodigo: f.modeloCodigo, ancho: f.ancho, alto: f.alto, origen: f.origen, lineas: [] };
    b.lineas.push({ mpId: f.mpId, mp: f.mp, unidad: f.unidad, cantidad: Number(f.cantidad) });
    mapa.set(f.id, b);
  }
  return [...mapa.values()];
}
