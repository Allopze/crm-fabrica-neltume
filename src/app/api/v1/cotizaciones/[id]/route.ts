import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { actualizarCabecera } from "@/domain/cotizaciones/edicion";

// GET /api/v1/cotizaciones/:id — texto original, interpretación, ítems con aviso de stock y estado de la lista (REQ-COT-3.1, 6.3).
// Sin permiso, inexistente o id inválido: el mismo 404, sin revelar si existe (REQ-COT-3.4, 10.2).
export const GET = conPermiso<{ id: string }>("cotizaciones.crear", async ({ params, sesion }) =>
  NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver"))), { ocultar: "Cotización no encontrada" });

const Cabecera = z.strictObject({ clienteId: z.uuid().nullable().optional(), notas: z.string().trim().max(1000).nullable().optional(),
  clienteDetectadoPor: z.enum(["rut", "correo", "telefono"]).optional(), version: z.number().int().positive() });

// PATCH /api/v1/cotizaciones/:id — cliente y notas de un borrador (versión optimista); el origen del cliente sugerido
// va a la auditoría (REQ-COT-2.18)
export const PATCH = conPermiso<{ id: string }>("cotizaciones.crear", async ({ req, params, actor, sesion }) => {
  const { version, ...d } = Cabecera.parse(await req.json());
  await bd().transaction((tx) => actualizarCabecera(tx, params.id, d, version, actor, "web"));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")));
});
