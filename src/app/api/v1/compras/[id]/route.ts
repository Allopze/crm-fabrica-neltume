import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { obtenerCompra } from "@/domain/compras/consulta";

// GET /api/v1/compras/:id — una factura leída de Chipax con sus líneas; el precio solo con costos.ver (REQ-MP-7.10)
export const GET = conPermiso<{ id: string }>("stock.ver", async ({ params, sesion }) =>
  NextResponse.json(await obtenerCompra(bd(), params.id, sesion.permisos.has("costos.ver"))));
