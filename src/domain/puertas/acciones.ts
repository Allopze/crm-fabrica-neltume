// Acciones sobre una puerta (REQ-STK-8.4, 8.5): editar sus datos, apartarla y liberarla. Todo auditado.
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { puerta } from "@/db/esquema/inventario";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { registrarMovimientos } from "../stock";
import { normalizarUbicacion } from "./normalizar";
import { normalizarCodigo } from "./puertas";

type Usuario = Actor & { id: string };

async function tomar(tx: Tx, codigo: string) {
  const [p] = await tx.select().from(puerta).where(eq(puerta.codigo, normalizarCodigo(codigo))).for("update");
  if (!p) throw new ErrorDominio("NO_ENCONTRADO", `No existe la puerta ${normalizarCodigo(codigo)}.`);
  return p;
}

export interface CambiosPuerta { ubicacion?: string; calidad?: "primera" | "segunda"; observacion?: string | null }

/** Ubicación, calidad y observación; nunca la existencia ni el artículo (REQ-STK-8.4). */
export async function editarPuerta(tx: Tx, codigo: string, c: CambiosPuerta, actor: Usuario, origen: Origen) {
  const p = await tomar(tx, codigo);
  const nuevo: CambiosPuerta = {};
  if (c.ubicacion !== undefined) nuevo.ubicacion = normalizarUbicacion(c.ubicacion);
  if (c.calidad !== undefined) nuevo.calidad = c.calidad;
  if (c.observacion !== undefined) nuevo.observacion = c.observacion?.trim() || null;
  const cambios = Object.fromEntries(Object.entries(nuevo).filter(([k, v]) => p[k as keyof typeof p] !== v));
  if (!Object.keys(cambios).length) throw new ErrorDominio("VALIDACION", "No hay cambios.");
  await tx.update(puerta).set({ ...cambios, actualizadoEn: sql`now()` }).where(eq(puerta.id, p.id));
  const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, p[k as keyof typeof p]]));
  await registrarAuditoria(tx, { actor, accion: "editar puerta", recurso: "puerta", recursoId: p.codigo, antes, despues: cambios, resultado: "ok", origen });
}

/** Aparta la puerta para un cliente sin nota de pedido: reserva de esa puerta (REQ-STK-8.5). */
export async function apartarPuerta(tx: Tx, codigo: string, para: string, actor: Usuario, origen: Origen, clave?: string) {
  const p = await tomar(tx, codigo);
  const nombre = para.replace(/\s+/g, " ").trim();
  if (nombre.length < 2) throw new ErrorDominio("VALIDACION", "Indica para quién se aparta.");
  await registrarMovimientos(tx, [{ articuloId: p.articuloId, tipo: "reserva", cantidad: 1, puertas: [p.codigo], motivo: `Apartada para ${nombre}`, refTipo: "puerta", refId: p.codigo }], actor, origen, clave);
}

/** Libera una puerta apartada; vuelve a quedar disponible. */
export async function liberarPuerta(tx: Tx, codigo: string, motivo: string, actor: Usuario, origen: Origen, clave?: string) {
  const p = await tomar(tx, codigo);
  await registrarMovimientos(tx, [{ articuloId: p.articuloId, tipo: "liberacion", cantidad: -1, puertas: [p.codigo], motivo: motivo.trim() || "Liberada", refTipo: "puerta", refId: p.codigo }], actor, origen, clave);
}
