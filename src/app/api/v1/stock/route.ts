import { NextResponse } from "next/server";
import { z } from "zod";
import { bd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { listarStock } from "@/domain/stock";

const Filtro = z.object({
  q: z.string().max(60).optional(), madera: z.enum(["O", "L", "M", "R"]).optional(), tipo: z.enum(["BLOQUE", "PANEL", "ESPECIAL"]).optional(),
  bajoMinimo: z.enum(["1", "true"]).optional(), cursor: z.string().max(40).optional(), limite: z.coerce.number().int().min(1).max(200).optional(),
});

// GET /api/v1/stock — existencia, reservado y disponible por artículo (REQ-STK-2.1, 2.2)
export const GET = conPermiso("stock.ver", async ({ req }) => {
  const f = Filtro.parse(Object.fromEntries(req.nextUrl.searchParams));
  return NextResponse.json(await listarStock(bd(), { ...f, bajoMinimo: Boolean(f.bajoMinimo) }));
});
