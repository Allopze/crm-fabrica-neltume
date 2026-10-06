// Calendario de días hábiles (REQ-COT-6.6): feriados legales calculados + adicionales de la tabla `feriado`
// (elecciones, leyes puntuales), que se cargan a mano con config.editar.
import { asc, eq } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { feriado } from "@/db/esquema/catalogo";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { feriadosLegales } from "./feriados";

/** Feriados del año de `desdeIso` y del siguiente (una vigencia puede cruzar el año), legales y adicionales. */
export async function cargarFeriados(tx: Tx, desdeIso: string): Promise<Set<string>> {
  const a = Number(desdeIso.slice(0, 4));
  const conjunto = new Set([...feriadosLegales(a).keys(), ...feriadosLegales(a + 1).keys()]);
  for (const { f } of await tx.select({ f: feriado.fecha }).from(feriado)) conjunto.add(f);
  return conjunto;
}

/** Feriados de un año para mostrar: los legales y los adicionales, marcados. */
export async function feriadosDelAnio(tx: Tx, a: number) {
  const adicionales = await tx.select().from(feriado).orderBy(asc(feriado.fecha));
  const legales = [...feriadosLegales(a)].map(([fecha, nombre]) => ({ fecha, nombre, origen: "ley" as const }));
  const extra = adicionales.filter((x) => x.fecha.startsWith(`${a}-`) && !feriadosLegales(a).has(x.fecha))
    .map((x) => ({ fecha: x.fecha, nombre: x.nombre, origen: "adicional" as const }));
  return [...legales, ...extra].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

export async function agregarFeriado(tx: Tx, d: { fecha: string; nombre: string }, actor: Actor, origen: Origen) {
  const nombre = d.nombre.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || Number.isNaN(Date.parse(d.fecha))) throw new ErrorDominio("VALIDACION", "Fecha inválida.");
  if (nombre.length < 3) throw new ErrorDominio("VALIDACION", "Indica el motivo del feriado.");
  if (feriadosLegales(Number(d.fecha.slice(0, 4))).has(d.fecha)) throw new ErrorDominio("VALIDACION", "Esa fecha ya es feriado legal.");
  const [nuevo] = await tx.insert(feriado).values({ fecha: d.fecha, nombre }).onConflictDoUpdate({ target: feriado.fecha, set: { nombre } }).returning();
  await registrarAuditoria(tx, { actor, accion: "agregar feriado", recurso: "feriado", recursoId: d.fecha, despues: nuevo, resultado: "ok", origen });
  return nuevo;
}

export async function quitarFeriado(tx: Tx, fecha: string, actor: Actor, origen: Origen) {
  const [antes] = await tx.delete(feriado).where(eq(feriado.fecha, fecha)).returning();
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Ese feriado adicional no existe.");
  await registrarAuditoria(tx, { actor, accion: "quitar feriado", recurso: "feriado", recursoId: fecha, antes, resultado: "ok", origen });
}
