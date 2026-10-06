import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { registrarAuditoria } from "@/domain/auditoria";
import { pdfCotizacion } from "@/domain/pdf/cotizacion";

// GET /api/v1/cotizaciones/:id/pdf — solo aprobadas (409 NO_APROBADA), auditado (REQ-COT-4.2, 4.3, 4.5; ADR-0004).
// Lleva los datos del cliente, por eso exige también clientes.ver (SECURITY §datos personales).
export const GET = conPermiso<{ id: string }>(["cotizaciones.aprobar", "clientes.ver"], async ({ params, actor }) => {
  const { numero, pdf } = await bd().transaction(async (tx) => {
    const r = await pdfCotizacion(tx, params.id);
    await registrarAuditoria(tx, { actor, accion: "descargar pdf", recurso: "cotizacion", recursoId: params.id, despues: { numero: r.numero }, resultado: "ok", origen: "web" });
    return r;
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="cotizacion-${numero}.pdf"`, "cache-control": "private, no-store" },
  });
});
