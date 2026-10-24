// Una persona aplica o descarta una revisión o anulación de la tienda que llegó con la nota ya en curso (ADR-0023 §4,
// D2, D5). Aplicar una revisión cancela la nota vigente (libera su reserva) y crea la nueva; aplicar una anulación la
// cancela. Lo ya producido queda en stock y las órdenes de producción siguen como estén: lo decide la persona.
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { notaPedido } from "@/db/esquema/comercial";
import { recepcionTienda } from "@/db/esquema/integracion";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { cancelarPedido } from "../pedidos/pedidos";
import type { PayloadConservado } from "./contrato";
import { crearNotaTienda, datosDesdePayload } from "./nota";

export async function resolverRecepcion(
  tx: Tx, notaId: string, recepcionId: string, d: { accion: "aplicar" | "descartar"; motivo: string }, actor: Actor & { id: string }, origen: Origen,
) {
  const motivo = d.motivo.trim();
  if (!motivo) throw new ErrorDominio("VALIDACION", "Indica el motivo.");
  const [r] = /^[0-9a-f-]{36}$/i.test(recepcionId) ? await tx.select().from(recepcionTienda).where(eq(recepcionTienda.id, recepcionId)).for("update") : [];
  if (!r || r.notaPedidoId !== notaId) throw new ErrorDominio("NO_ENCONTRADO", "Revisión de la tienda no encontrada");
  if (r.estado !== "pendiente_revision" && r.estado !== "anulacion_solicitada") throw new ErrorDominio("NO_EDITABLE", "Esa revisión de la tienda ya se resolvió.");
  const [nota] = await tx.select({ id: notaPedido.id, numero: notaPedido.numero, estado: notaPedido.estado, clienteId: notaPedido.clienteId })
    .from(notaPedido).where(eq(notaPedido.id, notaId)).for("update");

  let nueva: { id: string; numero: number } | null = null;
  if (d.accion === "aplicar") {
    if (nota.estado === "despachada") throw new ErrorDominio("NO_EDITABLE", `La nota de pedido N.º ${nota.numero} ya se despachó: descarta la revisión.`);
    const anulacion = r.estado === "anulacion_solicitada";
    if (nota.estado !== "cancelada") {
      await cancelarPedido(tx, notaId, anulacion ? `Anulada por la tienda; aplicada por una persona: ${motivo}` : `Reemplazada por la revisión ${r.revision} de la tienda: ${motivo}`, actor, origen);
    }
    if (!anulacion) nueva = await crearNotaTienda(tx, datosDesdePayload(r.payload as PayloadConservado, r.comercial), nota.clienteId, actor, origen, notaId);
  }
  await tx.update(recepcionTienda).set({
    estado: d.accion === "aplicar" ? "aplicada" : "descartada", notaPedidoId: nueva?.id ?? notaId,
    resueltaPor: actor.id, resueltaEn: sql`now()`, motivoResolucion: motivo,
  }).where(eq(recepcionTienda.id, r.id));
  await registrarAuditoria(tx, {
    actor, accion: d.accion === "aplicar" ? "aplicar revision de la tienda" : "descartar revision de la tienda", recurso: "nota_pedido", recursoId: notaId,
    resultado: "ok", origen, antes: { estado: r.estado }, despues: { revision: r.revision, evento: r.tipoEvento, motivo, notaNueva: nueva?.numero ?? null },
  });
  return { nueva };
}
