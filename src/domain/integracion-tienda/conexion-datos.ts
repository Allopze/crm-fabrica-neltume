// Pruebas de conexión con la tienda en la BD (ADR-0024, REQ-ADM-5.1–5.4): guardar las que llegan, dejar firmada la que
// la fábrica manda y leer el estado para la pantalla. Una prueba no crea pedidos ni toca `recepcion_tienda`. Las
// funciones reciben la transacción; el llamador decide cuándo confirmar (nunca se responde éxito sin el commit).
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { pruebaConexion } from "@/db/esquema/integracion";
import { type Actor, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { codigoCorto, type MensajePrueba, PRUEBAS_CONSERVADAS, type PruebaSaliente } from "./conexion";
import { sha256Hex } from "./documentos";
import { ErrorIntegracion } from "./errores";
import { codigoFabrica, configEnvio, configIntegracion } from "./firma";

/** Una prueba de la lista: sin el PDF ni la solicitud firmada. */
export interface PruebaVista {
  id: string; direccion: "enviada" | "recibida"; estado: string; eventId: string; codigo: string; nombreArchivo: string; bytes: number;
  destino: string | null; httpStatus: number | null; codigoError: string | null; detalle: string; latenciaMs: number | null;
  desfaseRelojMs: number | null; creadoEn: string; resueltoEn: string | null;
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
/** Lo que la persona lee en cada estado cuando el envío aún no dejó un diagnóstico propio. */
const DETALLE: Record<string, (bytes: number) => string> = {
  recibida: (b) => `PDF de ${kb(b)} recibido de la tienda.`,
  pendiente: () => "Esperando al servicio de enlace.",
  enviando: () => "Enviando a la tienda…",
};

const columnas = {
  id: pruebaConexion.id, direccion: pruebaConexion.direccion, estado: pruebaConexion.estado, eventId: pruebaConexion.eventId,
  nombreArchivo: pruebaConexion.nombreArchivo, bytes: pruebaConexion.bytes, destino: pruebaConexion.destino, httpStatus: pruebaConexion.httpStatus,
  codigoError: pruebaConexion.codigoError, detalle: pruebaConexion.detalle, latenciaMs: pruebaConexion.latenciaMs,
  desfaseRelojMs: pruebaConexion.desfaseRelojMs, creadoEn: pruebaConexion.creadoEn, resueltoEn: pruebaConexion.resueltoEn,
};

type Fila = Pick<typeof pruebaConexion.$inferSelect, keyof typeof columnas>;

function vista(f: Fila): PruebaVista {
  return {
    id: f.id, direccion: f.direccion as PruebaVista["direccion"], estado: f.estado, eventId: f.eventId, codigo: codigoCorto(f.eventId),
    nombreArchivo: f.nombreArchivo, bytes: f.bytes, destino: f.destino, httpStatus: f.httpStatus, codigoError: f.codigoError,
    detalle: f.detalle ?? DETALLE[f.estado]?.(f.bytes) ?? "", latenciaMs: f.latenciaMs, desfaseRelojMs: f.desfaseRelojMs,
    creadoEn: f.creadoEn.toISOString(), resueltoEn: f.resueltoEn?.toISOString() ?? null,
  };
}

/**
 * Deja las 20 pruebas más recientes del sentido (contando la que se acaba de insertar) y borra las demás, salvo las que
 * esperan o se están enviando: esas las cierra el servicio de enlace y nunca se borran de aquí.
 */
async function conservarUltimas(tx: Tx, direccion: "enviada" | "recibida") {
  await tx.execute(sql`
    DELETE FROM prueba_conexion
    WHERE direccion = ${direccion} AND estado NOT IN ('pendiente', 'enviando') AND id IN (
      SELECT id FROM prueba_conexion WHERE direccion = ${direccion} ORDER BY creado_en DESC, id DESC OFFSET ${PRUEBAS_CONSERVADAS})`);
}

/**
 * Guarda una prueba que mandó la tienda (REQ-ADM-5.2, 5.3). Mismo evento y mismo contenido → `duplicate`; otro contenido
 * → 409. Un candado para todas las recepciones las serializa (son pocas): así los duplicados se ven entre sí y la retención de 20
 * cuenta bien aunque lleguen eventos distintos a la vez. El único (`direccion`, `event_id`) es la red de seguridad.
 */
export async function guardarPruebaRecibida(
  tx: Tx, o: { mensaje: MensajePrueba; hashCuerpo: string; pdf: Buffer; ip?: string; correlacionId?: string },
): Promise<{ http: 200 | 201; status: "accepted" | "duplicate" }> {
  const { eventId, document } = o.mensaje;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('prueba-conexion:recibir'))`);
  const [previa] = await tx.select({ hashCuerpo: pruebaConexion.hashCuerpo }).from(pruebaConexion)
    .where(and(eq(pruebaConexion.direccion, "recibida"), eq(pruebaConexion.eventId, eventId)));
  if (previa) {
    if (previa.hashCuerpo === o.hashCuerpo) return { http: 200, status: "duplicate" };
    throw new ErrorIntegracion(409, "idempotency_conflict", "Ese evento ya llegó con otro contenido.");
  }
  const [fila] = await tx.insert(pruebaConexion).values({
    direccion: "recibida", eventId, estado: "recibida", hashCuerpo: o.hashCuerpo, contenido: o.pdf, sha256: document.sha256,
    bytes: o.pdf.length, nombreArchivo: document.filename,
  }).returning({ id: pruebaConexion.id });
  await conservarUltimas(tx, "recibida");
  await registrarAuditoria(tx, {
    actor: { tipo: "sistema", ip: o.ip }, accion: "recibir prueba de conexion", recurso: "prueba_conexion", recursoId: fila.id,
    despues: { eventId, archivo: document.filename, bytes: o.pdf.length, sha256: document.sha256 }, resultado: "ok", origen: "api", correlacionId: o.correlacionId,
  });
  return { http: 201, status: "accepted" };
}

/**
 * Deja la prueba ya firmada para que el servicio de enlace la reenvíe (REQ-ADM-5.1). Una a la vez: con otra en curso
 * (menos de 60 s) responde `PRUEBA_EN_CURSO`. Una pendiente de más de 60 s es una que `enlace` no tomó (el servicio sondea cada 2 s):
 * se da por reemplazada, para que no se acumulen filas con su PDF y su firma y para que, si el servicio vuelve, no mande una
 * prueba vieja junto con la nueva. Las que ya está enviando las cierra `enlace`.
 */
export async function solicitarPruebaEnviada(
  tx: Tx, o: { actor: Actor & { id: string }; prueba: PruebaSaliente; pdf: Buffer; correlacionId?: string },
): Promise<{ id: string }> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('prueba-conexion:enviar'))`);
  const [enCurso] = await tx.select({ id: pruebaConexion.id }).from(pruebaConexion)
    .where(and(eq(pruebaConexion.direccion, "enviada"), inArray(pruebaConexion.estado, ["pendiente", "enviando"]), gt(pruebaConexion.creadoEn, sql`now() - interval '60 seconds'`)))
    .limit(1);
  if (enCurso) throw new ErrorDominio("PRUEBA_EN_CURSO", "Ya hay una prueba en curso: espera su resultado.");
  const { prueba, pdf } = o;
  const reemplazadas = await tx.update(pruebaConexion).set({
    estado: "vencida", solicitud: null, cabeceras: null, codigoError: "reemplazada", resueltoEn: sql`now()`,
    detalle: "Se pidió otra prueba antes de que el servicio de enlace tomara esta, así que no se envió.",
  }).where(and(eq(pruebaConexion.direccion, "enviada"), eq(pruebaConexion.estado, "pendiente"))).returning({ id: pruebaConexion.id });
  const [fila] = await tx.insert(pruebaConexion).values({
    direccion: "enviada", eventId: prueba.eventId, estado: "pendiente", hashCuerpo: prueba.hashCuerpo, contenido: pdf, sha256: sha256Hex(pdf),
    bytes: pdf.length, nombreArchivo: prueba.nombreArchivo, solicitud: Buffer.from(prueba.cuerpo), cabeceras: prueba.cabeceras,
    firmadaEn: prueba.firmadaEn, creadoPor: o.actor.id,
  }).returning({ id: pruebaConexion.id });
  await conservarUltimas(tx, "enviada");
  await registrarAuditoria(tx, {
    actor: o.actor, accion: "solicitar prueba de conexion", recurso: "prueba_conexion", recursoId: fila.id,
    despues: { eventId: prueba.eventId, archivo: prueba.nombreArchivo, bytes: pdf.length, ...(reemplazadas.length ? { reemplazadas: reemplazadas.length } : {}) },
    resultado: "ok", origen: "web", correlacionId: o.correlacionId,
  });
  return { id: fila.id };
}

export async function listarPruebas(db: Tx): Promise<PruebaVista[]> {
  const filas = await db.select(columnas).from(pruebaConexion).orderBy(desc(pruebaConexion.creadoEn), desc(pruebaConexion.id)).limit(2 * PRUEBAS_CONSERVADAS + 2);
  return filas.map(vista);
}

export async function obtenerPrueba(db: Tx, id: string): Promise<PruebaVista | null> {
  const [f] = await db.select(columnas).from(pruebaConexion).where(eq(pruebaConexion.id, id));
  return f ? vista(f) : null;
}

export async function pdfDePrueba(db: Tx, id: string): Promise<{ contenido: Buffer; nombreArchivo: string } | null> {
  const [f] = await db.select({ contenido: pruebaConexion.contenido, nombreArchivo: pruebaConexion.nombreArchivo }).from(pruebaConexion).where(eq(pruebaConexion.id, id));
  return f ?? null;
}

/** Lo que muestra la pantalla: si la recepción y el envío están configurados, el destino del último intento y la lista. */
export async function estadoConexion(db: Tx, env: NodeJS.ProcessEnv = process.env) {
  const [ultimo] = await db.select({ destino: pruebaConexion.destino }).from(pruebaConexion)
    .where(and(eq(pruebaConexion.direccion, "enviada"), isNotNull(pruebaConexion.destino))).orderBy(desc(pruebaConexion.creadoEn)).limit(1);
  return {
    recepcion: { activa: configIntegracion(env) !== null, fabrica: codigoFabrica(env) },
    envio: { secretoConfigurado: configEnvio(env) !== null, destino: ultimo?.destino ?? null },
    pruebas: await listarPruebas(db),
  };
}
