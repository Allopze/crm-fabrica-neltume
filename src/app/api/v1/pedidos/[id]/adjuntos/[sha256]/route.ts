import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { adjuntoDeNota } from "@/domain/integracion-tienda/consulta";
import { descarga, respuestaArchivo } from "../../documentos/archivo";

// GET /api/v1/pedidos/:id/adjuntos/:sha256 — foto o croquis del cliente que nombra un ítem de esta nota (ADR-0023 §6)
export const GET = conPermiso<{ id: string; sha256: string }>("pedidos.gestionar", async ({ params }) => {
  const a = /^[0-9a-f-]{36}$/i.test(params.id) ? await adjuntoDeNota(bd(), params.id, params.sha256) : null;
  if (!a) throw new ErrorDominio("NO_ENCONTRADO", "Adjunto no encontrado (o aún no llega de la tienda).");
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[a.mime] ?? "bin";
  // Las imágenes se ven en el navegador; un PDF se descarga.
  return respuestaArchivo(a.contenido, a.mime, a.mime === "application/pdf" ? descarga(`referencia-${params.sha256.slice(0, 12)}.${extension}`) : "inline");
});
