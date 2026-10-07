// Alta de una cotización desde texto: borrador "interpretando" + trabajo en cola, en la misma transacción
// (ADR-0006, DESIGN §3 pasos 1–4). El texto original se guarda tal cual; a la IA solo va redactado.
import { and, eq, gt, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cotizacion, trabajoIa } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";

export const MAX_TEXTO = 4_000;
export const LIMITE_POR_HORA = 20;

export async function crearInterpretacion(tx: Tx, d: { texto: string; clienteId?: string | null }, actor: Actor & { id: string }, origen: Origen) {
  const texto = d.texto.trim();
  if (!texto) throw new ErrorDominio("VALIDACION", "Pega el texto del pedido.");
  if (texto.length > MAX_TEXTO) throw new ErrorDominio("TEXTO_DEMASIADO_LARGO", `El texto supera ${MAX_TEXTO.toLocaleString("es-CL")} caracteres.`);
  // SECURITY T4: límite por usuario y hora, contado bajo un bloqueo por usuario para que envíos simultáneos no lo
  // superen (auditoría H-06).
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ia:${actor.id}`}))`);
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(cotizacion)
    .where(and(eq(cotizacion.creadoPor, actor.id), eq(cotizacion.origen, "ia"), gt(cotizacion.creadoEn, sql`now() - interval '1 hour'`)));
  if (n >= LIMITE_POR_HORA) throw new ErrorDominio("LIMITE_IA", `Alcanzaste ${LIMITE_POR_HORA} interpretaciones en la última hora. Cotiza a mano o espera.`);

  const [c] = await tx.insert(cotizacion).values({
    estado: "interpretando", origen: "ia", textoOriginal: texto, clienteId: d.clienteId ?? null, creadoPor: actor.id,
  }).returning({ id: cotizacion.id, numero: cotizacion.numero, estado: cotizacion.estado });
  await tx.insert(trabajoIa).values({ cotizacionId: c.id });
  await registrarAuditoria(tx, { actor, accion: "interpretar (encolar)", recurso: "cotizacion", recursoId: c.id, despues: { numero: c.numero, largoTexto: texto.length }, resultado: "ok", origen });
  return c;
}
