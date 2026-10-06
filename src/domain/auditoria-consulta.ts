// Consulta del registro de auditoría, solo lectura (REQ-ADM-3.2, 3.3). Fechas en días calendario de Santiago.
import { and, desc, eq, ilike, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { auditLog, usuario } from "@/db/esquema/seguridad";

export interface FiltroAuditoria {
  actor?: string; recurso?: string; accion?: string; resultado?: "ok" | "denegado" | "error";
  desde?: string; hasta?: string; antesDe?: number; limite?: number;
}

const inicioDia = (d: string) => sql`(${d}::date)::timestamp AT TIME ZONE 'America/Santiago'`;

export async function consultarAuditoria(tx: Tx, f: FiltroAuditoria) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const filas = await tx.select({
    id: auditLog.id, ocurridoEn: auditLog.ocurridoEn, actorTipo: auditLog.actorTipo, actor: usuario.nombre, accion: auditLog.accion,
    recurso: auditLog.recurso, recursoId: auditLog.recursoId, antes: auditLog.antes, despues: auditLog.despues, resultado: auditLog.resultado,
    origen: auditLog.origen, ip: auditLog.ip, correlacionId: auditLog.correlacionId,
  }).from(auditLog).leftJoin(usuario, eq(usuario.id, auditLog.actorId))
    .where(and(
      f.actor ? eq(auditLog.actorId, f.actor) : undefined,
      f.recurso ? eq(auditLog.recurso, f.recurso) : undefined,
      f.accion ? ilike(auditLog.accion, `%${f.accion.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
      f.resultado ? eq(auditLog.resultado, f.resultado) : undefined,
      f.desde ? sql`${auditLog.ocurridoEn} >= ${inicioDia(f.desde)}` : undefined,
      f.hasta ? sql`${auditLog.ocurridoEn} < ${inicioDia(f.hasta)} + interval '1 day'` : undefined,
      f.antesDe ? lt(auditLog.id, f.antesDe) : undefined,
    ))
    .orderBy(desc(auditLog.id)).limit(limite + 1);
  const datos = filas.slice(0, limite);
  return { datos, siguiente: filas.length > limite ? datos.at(-1)!.id : null };
}

/** Valores para los filtros: recursos presentes y usuarios. */
export async function opcionesAuditoria(tx: Tx) {
  const recursos = (await tx.selectDistinct({ r: auditLog.recurso }).from(auditLog).orderBy(auditLog.recurso)).map((x) => x.r);
  const actores = await tx.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).orderBy(usuario.nombre);
  return { recursos, actores };
}
