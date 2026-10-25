// Cola de pruebas de conexión del servicio de enlace (ADR-0024 §3). Corre con el rol `neltume_enlace`: ve solo lo
// necesario para tomar una prueba enviada, actualiza únicamente su resultado (y borra la solicitud firmada) e inserta en
// la auditoría. Una prueba tomada nunca se reenvía sola: si el servicio cae a mitad, queda «sin respuesta».
import { and, asc, eq, sql } from "drizzle-orm";
import type { Bd, Tx } from "@/db/conexion";
import { pruebaConexion } from "@/db/esquema/integracion";
import { registrarAuditoria } from "@/domain/auditoria";
import { codigoCorto, VIGENCIA_FIRMA_S } from "@/domain/integracion-tienda/conexion";
import { ENVIO_INTERRUMPIDO, FIRMA_VENCIDA, type ResultadoEnvio } from "@/domain/integracion-tienda/diagnostico";
import type { PruebaPendiente, ResultadoConDestino } from "./envio";

/** Segundos que una prueba puede seguir «enviando» antes de darla por interrumpida (el plazo del envío es de 15 s). */
const ENVIANDO_MAX_S = 60;

/** Cierra una prueba con su resultado: sin solicitud firmada, con el diagnóstico y su fila de auditoría. */
async function cerrar(tx: Tx, id: string, eventId: string, r: ResultadoEnvio & { destino?: string | null }) {
  await tx.update(pruebaConexion).set({
    estado: r.estado, solicitud: null, cabeceras: null, destino: r.destino ?? null, httpStatus: r.httpStatus, codigoError: r.codigoError,
    detalle: r.detalle, latenciaMs: r.latenciaMs, desfaseRelojMs: r.desfaseRelojMs, resueltoEn: sql`now()`,
  }).where(eq(pruebaConexion.id, id));
  await registrarAuditoria(tx, {
    actor: { tipo: "sistema" }, accion: "enviar prueba de conexion", recurso: "prueba_conexion", recursoId: id,
    resultado: r.estado === "aceptada" || r.estado === "duplicada" ? "ok" : "error", origen: "enlace",
    despues: { eventId, codigo: codigoCorto(eventId), estado: r.estado, httpStatus: r.httpStatus, codigoError: r.codigoError, latenciaMs: r.latenciaMs,
      desfaseRelojMs: r.desfaseRelojMs, destino: r.destino ?? null },
  });
}

/**
 * Toma la prueba pendiente más antigua y la deja «enviando». Antes, cierra las que quedaron «enviando» de un servicio
 * caído y las pendientes con la firma de más de 4 minutos (la tienda las rechazaría): ninguna de las dos se envía.
 */
export async function tomarPrueba(db: Bd): Promise<PruebaPendiente | null> {
  return db.transaction(async (tx) => {
    const colgadas = await tx.select({ id: pruebaConexion.id, eventId: pruebaConexion.eventId }).from(pruebaConexion)
      .where(and(eq(pruebaConexion.direccion, "enviada"), eq(pruebaConexion.estado, "enviando"), sql`${pruebaConexion.tomadaEn} < now() - make_interval(secs => ${ENVIANDO_MAX_S})`))
      .for("update", { skipLocked: true });
    for (const c of colgadas) await cerrar(tx, c.id, c.eventId, ENVIO_INTERRUMPIDO);
    for (;;) {
      const [p] = await tx.select({
        id: pruebaConexion.id, eventId: pruebaConexion.eventId, solicitud: pruebaConexion.solicitud, cabeceras: pruebaConexion.cabeceras,
        edadS: sql<number>`extract(epoch from now() - ${pruebaConexion.firmadaEn})::float8`,
      }).from(pruebaConexion).where(and(eq(pruebaConexion.direccion, "enviada"), eq(pruebaConexion.estado, "pendiente")))
        .orderBy(asc(pruebaConexion.creadoEn)).limit(1).for("update", { skipLocked: true });
      if (!p) return null;
      if (p.edadS > VIGENCIA_FIRMA_S || !p.solicitud) {
        await cerrar(tx, p.id, p.eventId, FIRMA_VENCIDA);
        continue;
      }
      await tx.update(pruebaConexion).set({ estado: "enviando", tomadaEn: sql`now()` }).where(eq(pruebaConexion.id, p.id));
      return { id: p.id, eventId: p.eventId, solicitud: p.solicitud, cabeceras: p.cabeceras };
    }
  });
}

export async function registrarResultado(db: Bd, p: Pick<PruebaPendiente, "id" | "eventId">, r: ResultadoConDestino): Promise<void> {
  await db.transaction((tx) => cerrar(tx, p.id, p.eventId, r));
}
