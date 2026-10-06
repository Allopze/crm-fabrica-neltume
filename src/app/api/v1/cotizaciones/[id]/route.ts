import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";

// GET /api/v1/cotizaciones/:id — texto original, interpretación, ítems con aviso de stock y estado de la lista (REQ-COT-3.1, 6.3).
// Sin permiso: 403; inexistente o id inválido: 404 (no revela existencia, REQ-COT-3.4).
export const GET = conPermiso<{ id: string }>("cotizaciones.crear", async ({ params, sesion }) =>
  NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver"))));
