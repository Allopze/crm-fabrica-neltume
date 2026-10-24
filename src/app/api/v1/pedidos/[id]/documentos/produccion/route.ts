import { bd } from "@/db/conexion";
import { registrarAuditoria } from "@/domain/auditoria";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { documentoDeNota } from "@/domain/integracion-tienda/consulta";
import { obtenerPedido } from "@/domain/pedidos/consulta";
import { descarga, respuestaArchivo } from "../archivo";

// GET /api/v1/pedidos/:id/documentos/produccion — el PDF de producción de la tienda, sin precios; no se sirve si quedó retenido (ADR-0023 §6); auditado
export const GET = conPermiso<{ id: string }>("pedidos.gestionar", async ({ params, actor }) => {
  const r = await bd().transaction(async (tx) => {
    const p = await obtenerPedido(tx, params.id, { cliente: false, importes: false });
    const d = await documentoDeNota(tx, p.id, "produccion");
    if (!d) throw new ErrorDominio("NO_ENCONTRADO", "Esta nota no tiene ese documento de la tienda.");
    await registrarAuditoria(tx, { actor, accion: "descargar documento de la tienda", recurso: "nota_pedido", recursoId: p.id, despues: { tipo: "produccion", revision: d.revision }, resultado: "ok", origen: "web" });
    return { ...d, nota: p.refExterna };
  });
  return respuestaArchivo(r.contenido, "application/pdf", descarga(`Neltume - Nota de la tienda N.º ${r.nota} rev ${r.revision} (producción).pdf`));
}, { ocultar: "Nota de pedido no encontrada" });
