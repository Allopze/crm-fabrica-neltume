import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { pdfDePrueba } from "@/domain/integracion-tienda/conexion-datos";

export const dynamic = "force-dynamic";

// GET /api/v1/integracion/tienda/pruebas/:id/pdf — el PDF de una prueba, en el visor del navegador (ADR-0024 §3). Es un
// PDF que la fábrica generó o que verificó al recibirlo, sin datos de clientes; va privado y con `nosniff`.
export const GET = conPermiso<{ id: string }>("config.editar", async ({ params }) => {
  const id = z.uuid().safeParse(params.id);
  const pdf = id.success ? await pdfDePrueba(bd(), id.data) : null;
  if (!pdf) throw new ErrorDominio("NO_ENCONTRADO", "Prueba no encontrada");
  return new Response(new Uint8Array(pdf.contenido), {
    headers: {
      "content-type": "application/pdf", "content-disposition": `inline; filename="${pdf.nombreArchivo}"`,
      "cache-control": "private, no-store", "x-content-type-options": "nosniff",
    },
  });
});
