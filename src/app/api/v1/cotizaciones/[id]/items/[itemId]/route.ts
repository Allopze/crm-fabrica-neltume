import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { cambiarItem, eliminarItem } from "@/domain/cotizaciones/edicion";

// Importes: solo precioUnitario, y el dominio lo acepta únicamente para ítems "a pedido" (SECURITY T2).
const Cambio = z.strictObject({
  codigo: z.string().min(3).max(40).optional(),
  cantidad: z.number().int().min(1).max(500).optional(),
  precioUnitario: z.number().int().positive().max(1e10).optional(),
  version: z.number().int().positive(),
});

type P = { id: string; itemId: string };

// PATCH /api/v1/cotizaciones/:id/items/:itemId — resolver, cambiar cantidad o fijar precio a pedido (REQ-COT-3.2, 2.5)
export const PATCH = conPermiso<P>("cotizaciones.crear", async ({ req, params, actor, sesion }) => {
  const { version, ...cambio } = Cambio.parse(await req.json());
  await bd().transaction((tx) => cambiarItem(tx, params.id, params.itemId, cambio, version, actor, "web"));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")));
});

// DELETE /api/v1/cotizaciones/:id/items/:itemId?version=N
export const DELETE = conPermiso<P>("cotizaciones.crear", async ({ req, params, actor, sesion }) => {
  const version = z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get("version"));
  await bd().transaction((tx) => eliminarItem(tx, params.id, params.itemId, version, actor, "web"));
  return NextResponse.json(await obtenerCotizacion(bd(), params.id, sesion.permisos.has("clientes.ver")));
});
