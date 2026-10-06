// Cotización manual (REQ-COT-5): mismas reglas de precio que la generada con IA, sin pasar por el LLM.
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cotizacion, cotizacionItem } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { listaVigenteId, recalcularTotales } from "./calculo";
import { lineaConPrecio } from "./edicion";

/** Línea del catálogo (`codigo`) o línea libre por confirmar, sin precio (`detalle`, REQ-COT-5.2). */
export type LineaManual = { codigo: string; cantidad: number } | { detalle: string; cantidad: number };

export async function crearManual(tx: Tx, d: { clienteId?: string | null; items: LineaManual[] }, actor: Actor & { id: string }, origen: Origen) {
  if (!d.items.length) throw new ErrorDominio("VALIDACION", "Agrega al menos un ítem.");
  const listaId = await listaVigenteId(tx);
  const [c] = await tx.insert(cotizacion).values({ estado: "borrador", origen: "manual", clienteId: d.clienteId ?? null, listaId, creadoPor: actor.id })
    .returning({ id: cotizacion.id, numero: cotizacion.numero });

  for (const [i, l] of d.items.entries()) {
    const base = { cotizacionId: c.id, orden: i + 1, cantidad: l.cantidad, modificadoPor: actor.id, modificadoEn: sql`now()` };
    if ("codigo" in l) await tx.insert(cotizacionItem).values({ ...base, estadoItem: "ok", ...(await lineaConPrecio(tx, l.codigo, l.cantidad, listaId)) });
    else await tx.insert(cotizacionItem).values({ ...base, estadoItem: "por_confirmar", descripcion: "Artículo fuera de catálogo", duda: l.detalle.trim() });
  }
  const totales = await recalcularTotales(tx, c.id);
  await registrarAuditoria(tx, { actor, accion: "crear manual", recurso: "cotizacion", recursoId: c.id, despues: { numero: c.numero, items: d.items, ...totales }, resultado: "ok", origen });
  return c;
}
