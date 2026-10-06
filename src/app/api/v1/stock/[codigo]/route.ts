import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { articuloPorCodigo, movimientosDe, saldo } from "@/domain/stock";

// GET /api/v1/stock/:codigo — saldo y últimos movimientos de un artículo (REQ-STK-2.1)
export const GET = conPermiso<{ codigo: string }>("stock.ver", async ({ params }) => {
  const a = await articuloPorCodigo(bd(), decodeURIComponent(params.codigo));
  const [s, movimientos] = await Promise.all([saldo(bd(), { articuloId: a.id }), movimientosDe(bd(), a.id)]);
  return NextResponse.json({ codigo: a.codigo, minimo: a.stockMinimo, ...s, movimientos });
});
