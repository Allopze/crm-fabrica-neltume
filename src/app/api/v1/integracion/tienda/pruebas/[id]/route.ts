import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { ErrorDominio } from "@/domain/errores";
import { obtenerPrueba } from "@/domain/integracion-tienda/conexion-datos";

export const dynamic = "force-dynamic";

// GET /api/v1/integracion/tienda/pruebas/:id — estado de una prueba; la pantalla lo consulta cada segundo mientras espera
export const GET = conPermiso<{ id: string }>("config.editar", async ({ params }) => {
  const id = z.uuid().safeParse(params.id);
  const prueba = id.success ? await obtenerPrueba(bd(), id.data) : null;
  if (!prueba) throw new ErrorDominio("NO_ENCONTRADO", "Prueba no encontrada");
  return NextResponse.json(prueba, { headers: { "cache-control": "private, no-store" } });
});
