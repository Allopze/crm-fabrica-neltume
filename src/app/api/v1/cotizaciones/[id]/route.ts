import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { actualizarCabecera } from "@/domain/cotizaciones/edicion";

// GET /api/v1/cotizaciones/:id — texto original, interpretación, ítems con aviso de stock y estado de la lista (REQ-COT-3.1, 6.3).
// Sin permiso: 403; inexistente o id inválido: 404 (no revela existencia, REQ-COT-3.4).
export const GET = conPermiso<{ id: string }>("cotizaciones.crear", async ({ params, sesion }) =>
  NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver"))));

const Cabecera = z.strictObject({ clienteId: z.uuid().nullable().optional(), notas: z.string().trim().max(1000).nullable().optional(), version: z.number().int().positive() });

// PATCH /api/v1/cotizaciones/:id — cliente y notas de un borrador (versión optimista)
export const PATCH = conPermiso<{ id: string }>("cotizaciones.crear", async ({ req, params, actor, sesion }) => {
  const { version, ...d } = Cabecera.parse(await req.json());
  await bd().transaction((tx) => actualizarCabecera(tx, params.id, d, version, actor, "web"));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")));
});
