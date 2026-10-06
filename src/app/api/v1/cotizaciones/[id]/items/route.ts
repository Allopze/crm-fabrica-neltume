import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { agregarItem } from "@/domain/cotizaciones/edicion";

const Nuevo = z.strictObject({ codigo: z.string().min(3).max(40), cantidad: z.number().int().min(1).max(500), version: z.number().int().positive() });

// POST /api/v1/cotizaciones/:id/items — agrega un artículo del catálogo con precio de lista (REQ-COT-3.2, 5.1)
export const POST = conPermiso<{ id: string }>("cotizaciones.crear", async ({ req, params, actor, sesion }) => {
  const { version, ...d } = Nuevo.parse(await req.json());
  await bd().transaction((tx) => agregarItem(tx, params.id, d, version, actor, "web"));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")), { status: 201 });
});
