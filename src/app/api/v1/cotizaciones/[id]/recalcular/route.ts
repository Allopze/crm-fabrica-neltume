import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { recalcularConListaVigente } from "@/domain/cotizaciones/edicion";

// POST /api/v1/cotizaciones/:id/recalcular — pasa el borrador a la lista vigente (REQ-COT-6.3)
export const POST = conPermiso<{ id: string }>("cotizaciones.crear", async ({ req, params, actor, sesion }) => {
  const { version } = z.strictObject({ version: z.number().int().positive() }).parse(await req.json());
  await bd().transaction((tx) => recalcularConListaVigente(tx, params.id, version, actor, "web"));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")));
});
