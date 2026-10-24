import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { registrarAuditoria } from "@/domain/auditoria";
import { nombreArchivoPdf } from "@/domain/pdf/contenido";
import { pdfPedido } from "@/domain/pdf/pedido";

// GET /api/v1/pedidos/:id/pdf — nota de pedido con precios y datos del cliente: exige también pedidos.importes.ver y
// clientes.ver (REQ-COT-8.1, ADR-0023 §8). Para producción está la orden de trabajo, sin precios.
export const GET = conPermiso<{ id: string }>(["pedidos.gestionar", "pedidos.importes.ver", "clientes.ver"], async ({ params, actor }) => {
  const { numero, pdf } = await bd().transaction(async (tx) => {
    const r = await pdfPedido(tx, params.id);
    await registrarAuditoria(tx, { actor, accion: "descargar pdf", recurso: "nota_pedido", recursoId: params.id, despues: { numero: r.numero }, resultado: "ok", origen: "web" });
    return r;
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": nombreArchivoPdf("Nota de pedido", numero), "cache-control": "private, no-store" },
  });
});
