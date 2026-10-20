import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { agregarItem, agregarItemLibre } from "@/domain/cotizaciones/edicion";

const Nuevo = z.union([
  z.strictObject({ codigo: z.string().min(3).max(40), cantidad: z.number().int().min(1).max(500), version: z.number().int().positive() }),
  z.strictObject({ detalle: z.string().trim().min(2).max(200), cantidad: z.number().int().min(1).max(500), version: z.number().int().positive() }),
]);

// POST /api/v1/cotizaciones/:id/items — agrega un artículo del catálogo o una línea libre por confirmar (REQ-COT-3.2, 5.1, 5.2)
export const POST = conPermiso<{ id: string }>("cotizaciones.crear", async ({ req, params, actor, sesion }) => {
  const { version, ...d } = Nuevo.parse(await req.json());
  await bd().transaction((tx) => ("codigo" in d ? agregarItem(tx, params.id, d, version, actor, "web") : agregarItemLibre(tx, params.id, d, version, actor, "web")));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")), { status: 201 });
});
