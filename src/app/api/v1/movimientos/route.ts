import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { articuloPorCodigo, movimientosDe } from "@/domain/stock";

// GET /api/v1/movimientos?articulo=CODIGO — historial inmutable de un artículo (REQ-STK-2.1)
export const GET = conPermiso("stock.ver", async ({ req }) => {
  const codigo = z.string().min(3).max(40).parse(req.nextUrl.searchParams.get("articulo"));
  const a = await articuloPorCodigo(bd(), codigo);
  return NextResponse.json({ datos: await movimientosDe(bd(), a.id, 200) });
});
