// Lo que la ficha de una nota muestra de la tienda (ADR-0023 §6, §8): revisión, avisos de la recepción, documentos y
// revisiones pendientes. El documento comercial y lo comercial de la tienda solo con pedidos.importes.ver + clientes.ver.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { pedidoItem } from "@/db/esquema/comercial";
import { adjuntoTienda, documentoTienda } from "@/db/esquema/integracion";
import type { Vista } from "../pedidos/consulta";
import { pendientesDeNota, recepcionDeNota } from "./recibir";

export type TipoDocumento = "comercial" | "produccion";

export async function datosTienda(tx: Tx, notaId: string, vista: Vista) {
  const recepcion = await recepcionDeNota(tx, notaId);
  const pendientes = await pendientesDeNota(tx, notaId);
  if (!recepcion && !pendientes.length) return null;
  const documentos = recepcion
    ? (await tx.select({ tipo: documentoTienda.tipo, bytes: documentoTienda.bytes, retenido: documentoTienda.retenido, motivoRetencion: documentoTienda.motivoRetencion })
      .from(documentoTienda).where(eq(documentoTienda.recepcionId, recepcion.id)))
      .filter((d) => d.tipo === "produccion" || (vista.importes && vista.cliente))
    : [];
  return {
    revision: recepcion?.revision ?? null,
    recibidaEn: recepcion?.creadoEn ?? null,
    // Los avisos de precio comparan montos: sin importes, solo los demás.
    avisos: (recepcion?.avisos ?? []).filter((a) => vista.importes || !a.includes("$")),
    comercial: vista.importes ? recepcion?.comercial ?? null : null,
    documentos,
    pendientes: pendientes.map((p) => ({ ...p, avisos: p.avisos.filter((a) => vista.importes || !a.includes("$")) })),
  };
}

/** PDF de la tienda de la nota; el de producción retenido no se sirve. Null si no existe o no corresponde. */
export async function documentoDeNota(tx: Tx, notaId: string, tipo: TipoDocumento) {
  const r = await recepcionDeNota(tx, notaId);
  if (!r) return null;
  const [d] = await tx.select({ contenido: documentoTienda.contenido, retenido: documentoTienda.retenido }).from(documentoTienda)
    .where(and(eq(documentoTienda.recepcionId, r.id), eq(documentoTienda.tipo, tipo)));
  return d && !d.retenido ? { contenido: d.contenido, revision: r.revision } : null;
}

/** Un adjunto del cliente, solo si lo nombra algún ítem de esa nota (no se piden archivos ajenos por su hash). */
export async function adjuntoDeNota(tx: Tx, notaId: string, sha: string) {
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;
  const [usa] = await tx.select({ id: pedidoItem.id }).from(pedidoItem)
    .where(and(eq(pedidoItem.notaPedidoId, notaId), sql`${pedidoItem.referencias} @> ${JSON.stringify([{ attachmentId: sha }])}::jsonb`)).limit(1);
  if (!usa) return null;
  const [a] = await tx.select({ mime: adjuntoTienda.mime, contenido: adjuntoTienda.contenido }).from(adjuntoTienda).where(eq(adjuntoTienda.sha256, sha));
  return a ?? null;
}

/** Adjuntos ya recibidos de una lista de hashes (el resto queda «pendiente de recibir»). */
export async function adjuntosRecibidos(tx: Tx, shas: string[]): Promise<Set<string>> {
  if (!shas.length) return new Set();
  const filas = await tx.select({ sha256: adjuntoTienda.sha256 }).from(adjuntoTienda).where(inArray(adjuntoTienda.sha256, shas));
  return new Set(filas.map((f) => f.sha256));
}
