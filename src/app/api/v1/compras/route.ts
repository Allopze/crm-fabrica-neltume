import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { resumenCompras } from "@/domain/compras/consulta";

// GET /api/v1/compras — por asociar, por revisar, facturas recientes y última sincronización (REQ-MP-7.x; ADR-0021)
export const GET = conPermiso("stock.ver", async ({ sesion }) => NextResponse.json(await resumenCompras(bd(), sesion.permisos.has("costos.ver"))));
