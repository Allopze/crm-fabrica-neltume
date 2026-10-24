import { bd } from "@/db/conexion";
import { registrarAuditoria } from "@/domain/auditoria";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { documentoDeNota } from "@/domain/integracion-tienda/consulta";
import { obtenerPedido } from "@/domain/pedidos/consulta";
import { descarga, respuestaArchivo } from "../archivo";

// GET /api/v1/pedidos/:id/documentos/comercial — el PDF comercial de la tienda: precios y datos del cliente final, solo con permiso (ADR-0023 §6); auditado
export const GET = conPermiso<{ id: string }>(["pedidos.gestionar", "pedidos.importes.ver", "clientes.ver"], async ({ params, actor }) => {
  const r = await bd().transaction(async (tx) => {
    const p = await obtenerPedido(tx, params.id, { cliente: false, importes: false });
    const d = await documentoDeNota(tx, p.id, "comercial");
    if (!d) throw new ErrorDominio("NO_ENCONTRADO", "Esta nota no tiene ese documento de la tienda.");
    await registrarAuditoria(tx, { actor, accion: "descargar documento de la tienda", recurso: "nota_pedido", recursoId: p.id, despues: { tipo: "comercial", revision: d.revision }, resultado: "ok", origen: "web" });
    return { ...d, nota: p.refExterna };
  });
  return respuestaArchivo(r.contenido, "application/pdf", descarga(`Neltume - Nota de la tienda N.º ${r.nota} rev ${r.revision} (comercial).pdf`));
}, { ocultar: "Nota de pedido no encontrada" });
