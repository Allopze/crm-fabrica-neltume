// Carga inicial de materias primas y BOM reales (T2.7, ADR-0012) con lo que entregó la fábrica («Costos generales»
// del detalle de costos de mayo 2026): solo nombres, unidades y usos por puerta, ningún monto. La madera de cada
// puerta sale de las pulgadas del catálogo (iguales en las cuatro maderas). Idempotente: no pisa materias primas ni
// asociaciones existentes, ni un BOM real definido después; los BOM de demostración quedan reemplazados por versión.
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { madera, modelo } from "@/db/esquema/catalogo";
import { bom, maderaInsumo, materiaPrima } from "@/db/esquema/produccion";
import type { Actor, Origen } from "./auditoria";
import { asociarMaderaInsumo, definirBom } from "./bom";
import { crearMateriaPrima } from "./materias-primas";

/** Insumos que la fábrica compra y controla, con su unidad (`unidad.codigo`). */
export const INSUMOS_REALES: { nombre: string; unidad: string }[] = [
  { nombre: "Lija orbital grano 80", unidad: "un" },
  { nombre: "Lija de banda industrial grano 100 (lijadora nueva)", unidad: "un" },
  { nombre: "Lija de banda industrial grano 80 (lijadora nueva)", unidad: "un" },
  { nombre: "Lija de banda industrial grano 100 (lijadora antigua)", unidad: "un" },
  { nombre: "Lija de banda industrial grano 80 (lijadora antigua)", unidad: "un" },
  { nombre: "Lija de banda manual grano 80", unidad: "un" },
  { nombre: "Retape (balde 14 L)", unidad: "un" },
  { nombre: "Film (rollo)", unidad: "un" },
  { nombre: "Pegamento en barra", unidad: "kg" },
  { nombre: "Silicona en barra", unidad: "un" },
  { nombre: "Adhesivo rápido (botella 1 kg)", unidad: "un" },
  { nombre: "Adhesivo Titebond", unidad: "kg" },
  { nombre: "Tarugo 12 × 80 mm", unidad: "un" },
  { nombre: "Madera oregón 2x4 en 4,00 m", unidad: "pulg" },
  { nombre: "Madera oregón 2x5 en 4,00 m", unidad: "pulg" },
  { nombre: "Madera oregón 2x6 en 4,00 m", unidad: "pulg" },
  { nombre: "Pulgadas de raulí", unidad: "pulg" },
  { nombre: "Pulgadas de lenga", unidad: "pulg" },
  { nombre: "Pulgadas de mara", unidad: "pulg" },
  { nombre: "Pulgadas de pino oregón", unidad: "pulg" },
];

/** De qué materia prima se descuenta la madera de la puerta, por código de madera. */
export const MADERA_INSUMO_REAL: Record<string, string> = {
  R: "Pulgadas de raulí", L: "Pulgadas de lenga", M: "Pulgadas de mara", O: "Pulgadas de pino oregón",
};

/** Usos por puerta que la fábrica declaró («1 lija por 70 puertas», «10 puertas por film»…). */
export const USO_POR_PUERTA: { nombre: string; cantidad: number }[] = [
  { nombre: "Lija de banda industrial grano 100 (lijadora nueva)", cantidad: 1 / 70 },
  { nombre: "Lija de banda industrial grano 80 (lijadora nueva)", cantidad: 1 / 70 },
  { nombre: "Lija de banda manual grano 80", cantidad: 1 / 10 },
  { nombre: "Film (rollo)", cantidad: 1 / 10 },
  { nombre: "Silicona en barra", cantidad: 1 / 10 },
];

export async function cargarBomReal(tx: Tx, actor: Actor & { id: string }, origen: Origen) {
  const informe = { insumosCreados: 0, maderasAsociadas: 0, bomsCreados: 0, bomsConservados: 0 };

  // Mismo criterio que crearMateriaPrima: el nombre no distingue mayúsculas.
  const ids = new Map((await tx.select({ id: materiaPrima.id, nombre: materiaPrima.nombre }).from(materiaPrima)).map((m) => [m.nombre.toLowerCase(), m.id]));
  const id = (nombre: string) => ids.get(nombre.toLowerCase())!;
  for (const i of INSUMOS_REALES) {
    if (ids.has(i.nombre.toLowerCase())) continue;
    const creada = await crearMateriaPrima(tx, { nombre: i.nombre, unidadCodigo: i.unidad }, actor, origen);
    ids.set(i.nombre.toLowerCase(), creada.id);
    informe.insumosCreados++;
  }

  const asociadas = new Set((await tx.select({ id: maderaInsumo.maderaId }).from(maderaInsumo)).map((m) => m.id));
  for (const m of await tx.select().from(madera)) {
    const nombre = MADERA_INSUMO_REAL[m.codigo];
    if (!nombre || asociadas.has(m.id)) continue;
    await asociarMaderaInsumo(tx, m.codigo, id(nombre), actor, origen);
    informe.maderasAsociadas++;
  }

  const usos = USO_POR_PUERTA.map((u) => ({ materiaPrimaId: id(u.nombre), cantidad: Number(u.cantidad.toFixed(4)) }));
  // Lo que está fuera de catálogo (mamparas, de segunda… de la carga de inventario, ADR-0018) no tiene pulgadas ni
  // receta: sin BOM, su orden se cierra registrando el consumo a mano (REQ-MP-4.2).
  for (const mo of await tx.select().from(modelo).where(eq(modelo.fueraCatalogo, false))) {
    const [ultimo] = await tx.select({ origen: bom.origen }).from(bom)
      .where(and(eq(bom.modeloId, mo.id), isNull(bom.anchoCodigo), isNull(bom.altoCodigo))).orderBy(desc(bom.vigenteDesde)).limit(1);
    if (ultimo?.origen === "real") { informe.bomsConservados++; continue; }
    // Accesorios: solo la madera; los usos por puerta declarados son de puertas.
    const lineas = [{ maderaPuerta: true, cantidad: 1 }, ...(mo.familia === "puerta" ? usos : [])];
    await definirBom(tx, { modeloCodigo: mo.codigo, origen: "real", lineas }, actor, origen);
    informe.bomsCreados++;
  }
  return informe;
}
