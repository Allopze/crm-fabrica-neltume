// Recepción de un evento firmado de la tienda, todo en una transacción (ADR-0023 §3, §4). Un candado por pedido de
// la tienda serializa los envíos simultáneos; los únicos de `recepcion_tienda` (clave, evento, pedido + revisión) son
// la red de seguridad. Nunca se responde éxito sin el commit: el llamador abre la transacción.
import { and, eq, max, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { documentoTienda, recepcionTienda } from "@/db/esquema/integracion";
import { notaPedido } from "@/db/esquema/comercial";
import { registrarAuditoria } from "../auditoria";
import { cancelarPedido } from "../pedidos/pedidos";
import { type MensajeTienda, payloadConservado } from "./contrato";
import type { DocumentoVerificado } from "./documentos";
import { actorIntegracion, clienteTienda, crearNotaTienda, ErrorIntegracion, notaVigente, sinIniciar } from "./nota";

export interface Recepcion {
  http: 200 | 201 | 202;
  status: "accepted" | "duplicate";
  factoryOrderId?: string;
  recepcionId: string;
}

export interface EntradaRecepcion {
  clave: string; hashCuerpo: string; clienteRut: string | null;
  documentos?: { comercial: DocumentoVerificado; produccion: DocumentoVerificado };
}

export async function recibirMensaje(tx: Tx, m: MensajeTienda, e: EntradaRecepcion): Promise<Recepcion> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tienda:${m.sourceOrderId}`}))`);

  // Idempotencia (contrato §7.2): misma clave y mismo cuerpo → duplicado; otro cuerpo, o el mismo evento con otra clave → 409.
  // Una revisión anterior a la vigente es `stale_revision` aunque reutilice su clave (contrato §7.5).
  const [previa] = await tx.select().from(recepcionTienda)
    .where(or(eq(recepcionTienda.idempotenciaClave, e.clave), eq(recepcionTienda.eventId, m.eventId)));
  if (previa && previa.idempotenciaClave === e.clave && previa.hashCuerpo === e.hashCuerpo) {
    return { http: 200, status: "duplicate", factoryOrderId: previa.notaPedidoId ?? undefined, recepcionId: previa.id };
  }
  const [{ ultima }] = await tx.select({ ultima: max(recepcionTienda.revision) }).from(recepcionTienda).where(eq(recepcionTienda.sourceOrderId, m.sourceOrderId));
  if (ultima !== null && m.sourceOrderRevision < ultima) {
    throw new ErrorIntegracion(409, "stale_revision", `Ya se recibió la revisión ${ultima} de este pedido.`);
  }
  if (previa) throw new ErrorIntegracion(409, "idempotency_conflict", "Esa clave de idempotencia o ese evento ya llegaron con otro contenido.");
  if (ultima !== null && m.sourceOrderRevision === ultima) {
    throw new ErrorIntegracion(409, "stale_revision", `Ya se recibió la revisión ${ultima} de este pedido.`);
  }

  const actor = await actorIntegracion(tx);
  const clienteId = await clienteTienda(tx, e.clienteRut);
  const numeroNota = m.order?.orderNumber ?? m.cancellation!.orderNumber;
  const vigente = await notaVigente(tx, m.sourceOrderId, clienteId, numeroNota);
  const libre = vigente ? await sinIniciar(tx, vigente) : false;
  const avisos: string[] = [];
  let estado: string;
  let notaId: string | null = vigente?.id ?? null;
  let http: Recepcion["http"];

  if (m.eventType === "order.ready") {
    const datos = { sourceOrderId: m.sourceOrderId, revision: m.sourceOrderRevision, order: { ...m.order!, project: m.order!.customer.project }, comercial: m.order!.commercial };
    if (vigente && vigente.origen === "nota_tienda" && m.sourceOrderRevision === 1) {
      // Ya la cargó una persona desde el PDF (ADR-0008): se vincula sin crear otra.
      estado = "incorporada";
      http = 200;
      avisos.push(`La nota ${numeroNota} ya estaba cargada desde el PDF como la nota de pedido N.º ${vigente.numero}.`);
    } else if (vigente && !libre) {
      estado = "pendiente_revision";
      http = 202;
      avisos.push(`La nota de pedido N.º ${vigente.numero} ya está en curso: una persona aplica o descarta la revisión ${m.sourceOrderRevision}.`);
    } else {
      if (vigente) await cancelarPedido(tx, vigente.id, `Reemplazada por la revisión ${m.sourceOrderRevision} de la nota ${numeroNota} de la tienda.`, actor, "api");
      const nueva = await crearNotaTienda(tx, datos, clienteId, actor, "api", vigente?.id ?? null);
      notaId = nueva.id;
      estado = "incorporada";
      http = 201;
      avisos.push(...nueva.avisos);
    }
  } else {
    const c = m.cancellation!;
    const motivo = `Anulada por la tienda${c.reason?.trim() ? `: ${c.reason.trim()}` : "."}`;
    if (!vigente || vigente.estado === "despachada") {
      estado = "registrada";
      http = 202;
      if (vigente) avisos.push(`La tienda anuló la nota ${numeroNota}, pero la nota de pedido N.º ${vigente.numero} ya se despachó.`);
    } else if (libre) {
      await cancelarPedido(tx, vigente.id, motivo, actor, "api");
      estado = "cancelada";
      http = 200;
    } else {
      estado = "anulacion_solicitada";
      http = 202;
      avisos.push(`${motivo} La nota de pedido N.º ${vigente.numero} ya está en curso: una persona decide si se cancela.`);
    }
  }

  // Lo que esperaba a una persona queda superado por esta revisión: así nunca se aplica una versión vieja.
  await tx.update(recepcionTienda).set({ estado: "descartada", resueltaPor: actor.id, resueltaEn: sql`now()`, motivoResolucion: `Superada por la revisión ${m.sourceOrderRevision} de la tienda.` })
    .where(and(eq(recepcionTienda.sourceOrderId, m.sourceOrderId), or(eq(recepcionTienda.estado, "pendiente_revision"), eq(recepcionTienda.estado, "anulacion_solicitada"))));
  const [r] = await tx.insert(recepcionTienda).values({
    idempotenciaClave: e.clave, eventId: m.eventId, hashCuerpo: e.hashCuerpo, tipoEvento: m.eventType, sourceOrderId: m.sourceOrderId,
    revision: m.sourceOrderRevision, numeroNota, notaPedidoId: notaId, estado, payload: payloadConservado(m), comercial: m.order?.commercial ?? null, avisos,
  }).returning({ id: recepcionTienda.id });
  if (e.documentos) {
    await tx.insert(documentoTienda).values((["comercial", "produccion"] as const).map((tipo) => {
      const d = tipo === "comercial" ? e.documentos!.comercial : e.documentos!.produccion;
      return { recepcionId: r.id, tipo, contenido: d.contenido, sha256: d.sha256, bytes: d.contenido.length, nombreOrigen: d.nombre.slice(0, 200),
        retenido: d.retencion !== null, motivoRetencion: d.retencion };
    }));
    if (e.documentos.produccion.retencion) avisos.push(e.documentos.produccion.retencion);
  }
  await registrarAuditoria(tx, {
    actor, accion: "recibir de la tienda", recurso: "recepcion_tienda", recursoId: r.id, resultado: "ok", origen: "api",
    despues: { evento: m.eventType, sourceOrderId: m.sourceOrderId, revision: m.sourceOrderRevision, notaTienda: numeroNota, estado, notaPedidoId: notaId, avisos: avisos.length },
  });
  // El paso queda en el historial de la nota afectada (REQ-COT-8.15) cuando espera a una persona.
  if (notaId && (estado === "pendiente_revision" || estado === "anulacion_solicitada")) {
    await registrarAuditoria(tx, {
      actor, accion: estado === "pendiente_revision" ? "revision de la tienda" : "anulacion de la tienda", recurso: "nota_pedido", recursoId: notaId,
      resultado: "ok", origen: "api", despues: { revision: m.sourceOrderRevision, recepcion: r.id },
    });
  }
  return { http, status: "accepted", factoryOrderId: notaId ?? undefined, recepcionId: r.id };
}

/** Recepciones que esperan a una persona para una nota (banner de la ficha). */
export async function pendientesDeNota(tx: Tx, notaId: string) {
  return tx.select({ id: recepcionTienda.id, tipoEvento: recepcionTienda.tipoEvento, revision: recepcionTienda.revision, estado: recepcionTienda.estado,
    numeroNota: recepcionTienda.numeroNota, creadoEn: recepcionTienda.creadoEn, avisos: recepcionTienda.avisos })
    .from(recepcionTienda)
    .where(and(eq(recepcionTienda.notaPedidoId, notaId), or(eq(recepcionTienda.estado, "pendiente_revision"), eq(recepcionTienda.estado, "anulacion_solicitada"))));
}

/** La recepción que creó (o vinculó) la nota: de ahí salen sus documentos y avisos. */
export async function recepcionDeNota(tx: Tx, notaId: string) {
  const [r] = await tx.select({ id: recepcionTienda.id, revision: recepcionTienda.revision, avisos: recepcionTienda.avisos, comercial: recepcionTienda.comercial,
    creadoEn: recepcionTienda.creadoEn })
    .from(recepcionTienda).innerJoin(notaPedido, eq(notaPedido.id, recepcionTienda.notaPedidoId))
    .where(and(eq(recepcionTienda.notaPedidoId, notaId), or(eq(recepcionTienda.estado, "incorporada"), eq(recepcionTienda.estado, "aplicada")), eq(recepcionTienda.tipoEvento, "order.ready")))
    .orderBy(sql`${recepcionTienda.revision} DESC`).limit(1);
  return r ?? null;
}
