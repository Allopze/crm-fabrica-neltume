import { bd } from "@/db/conexion";
import { registrarAuditoria } from "@/domain/auditoria";
import { conPermiso } from "@/domain/auth/politica";
import { nombreArchivoPdf } from "@/domain/pdf/contenido";
import { pdfOrdenTrabajo } from "@/domain/pdf/orden-trabajo";
import { respuestaArchivo } from "../documentos/archivo";

// GET /api/v1/pedidos/:id/orden-trabajo — PDF para producción, sin precios ni datos del cliente final (ADR-0023 §7)
export const GET = conPermiso<{ id: string }>("pedidos.gestionar", async ({ params, actor }) => {
  const { numero, pdf } = await bd().transaction(async (tx) => {
    const r = await pdfOrdenTrabajo(tx, params.id);
    await registrarAuditoria(tx, { actor, accion: "descargar orden de trabajo", recurso: "nota_pedido", recursoId: params.id, despues: { numero: r.numero }, resultado: "ok", origen: "web" });
    return r;
  });
  return respuestaArchivo(pdf, "application/pdf", nombreArchivoPdf("Orden de trabajo", numero));
});
