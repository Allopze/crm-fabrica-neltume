// Aprobación: congela precios y totales, fija vigencia y aprobador (REQ-COT-4.1, 4.4, 4.5, 6.1, 6.2).
// Desde aquí la cotización es de solo lectura (trigger). Nada se envía al cliente sin esta acción humana.
import { and, count, eq, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { parametro } from "@/db/esquema/catalogo";
import { cotizacion, cotizacionItem } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { cargarFeriados } from "../precios/calendario";
import { hoySantiago, sumarDiasHabiles } from "../precios/dias-habiles";
import { recalcularTotales } from "./calculo";

export async function aprobarCotizacion(tx: Tx, id: string, version: number, actor: Actor & { id: string }, origen: Origen) {
  const [c] = await tx.select().from(cotizacion).where(eq(cotizacion.id, id)).for("update");
  if (!c) throw new ErrorDominio("NO_ENCONTRADO", "Cotización no encontrada");
  if (c.estado !== "borrador") throw new ErrorDominio("NO_EDITABLE", `La cotización ${c.numero} está ${c.estado}: no se puede aprobar.`);
  if (c.version !== version) throw new ErrorDominio("VERSION_OBSOLETA", "Otra persona cambió esta cotización. Recarga para ver la versión actual.");
  const [{ total }] = await tx.select({ total: count() }).from(cotizacionItem).where(eq(cotizacionItem.cotizacionId, id));
  if (total === 0) throw new ErrorDominio("VALIDACION", "La cotización no tiene ítems.");
  const [{ pendientes }] = await tx.select({ pendientes: count() }).from(cotizacionItem).where(and(eq(cotizacionItem.cotizacionId, id), ne(cotizacionItem.estadoItem, "ok")));
  if (pendientes > 0) throw new ErrorDominio("ITEMS_POR_CONFIRMAR", `Resuelve ${pendientes} ${pendientes === 1 ? "ítem" : "ítems"} por confirmar antes de aprobar.`);
  if (!c.clienteId) throw new ErrorDominio("VALIDACION", "Elige el cliente antes de aprobar.");

  const totales = await recalcularTotales(tx, id);
  const [p] = await tx.select().from(parametro).where(eq(parametro.clave, "vigencia_dias_habiles"));
  const hoy = hoySantiago();
  const vigenciaHasta = sumarDiasHabiles(hoy, Number(p?.valor ?? 10), await cargarFeriados(tx, hoy));
  await tx.update(cotizacion).set({
    estado: "aprobada", aprobadaPor: actor.id, aprobadaEn: sql`now()`, vigenciaHasta, version: c.version + 1, actualizadoEn: sql`now()`,
  }).where(eq(cotizacion.id, id));
  await registrarAuditoria(tx, { actor, accion: "aprobar", recurso: "cotizacion", recursoId: id, antes: { estado: "borrador" }, despues: { estado: "aprobada", ...totales, vigenciaHasta }, resultado: "ok", origen });
  return { numero: c.numero, vigenciaHasta, ...totales };
}
